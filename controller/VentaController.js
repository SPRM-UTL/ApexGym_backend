import { ventaDao } from '../dao/VentaDao.js';
import { BaseController } from './BaseController.js';
import { prisma } from '../dao/BaseDao.js';
import {
    ESTADO_VENTA_CANCELADA,
    ESTADO_VENTA_COMPLETADA,
    calcularEfectivoEsperado,
    esMetodoEfectivo,
    obtenerTotalesApertura,
    redondear,
} from '../utilidades/calculosCaja.js';

const MAX_PARTIDAS = 100;
const MAX_CANTIDAD_POR_PARTIDA = 10000;
const MAX_OBSERVACIONES = 500;
const MAX_MOTIVO_CANCELACION = 255;
const MIN_MOTIVO_CANCELACION = 5;
const ESTADOS_VALIDOS = [ESTADO_VENTA_COMPLETADA, ESTADO_VENTA_CANCELADA];
const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Error de negocio que debe responderse como 404. */
class NoEncontradoError extends Error {}

const nombreCompleto = (persona) =>
    persona
        ? [persona.nombre, persona.apellidoPaterno, persona.apellidoMaterno].filter(Boolean).join(' ')
        : null;

export class VentaController extends BaseController {
    constructor() {
        super(ventaDao);
    }

    // ── POST /api/ventas ─────────────────────────────────────────────────────
    /**
     * Registra una venta de productos:
     *  - exige una caja con apertura ABIERTA (la indicada o la del empleado en sesión),
     *  - valida stock suficiente y descuenta inventario de forma atómica,
     *  - toma los precios SIEMPRE de la base de datos (nunca del cliente),
     *  - vincula la venta a la apertura de caja activa.
     */
    crear = async (req, res) => {
        try {
            const { aperturaCajaId, empleadoId, clienteId, metodoPagoId, items, montoRecibido, observaciones } =
                req.body ?? {};

            const partidas = this.normalizarPartidas(items);
            if (!metodoPagoId || !Number.isInteger(Number(metodoPagoId)) || Number(metodoPagoId) <= 0)
                throw new Error('El método de pago es requerido');
            if (observaciones && String(observaciones).trim().length > MAX_OBSERVACIONES)
                throw new Error(`Las observaciones no pueden exceder ${MAX_OBSERVACIONES} caracteres`);
            if (montoRecibido !== undefined && montoRecibido !== null && montoRecibido !== '') {
                if (isNaN(Number(montoRecibido)) || Number(montoRecibido) < 0)
                    throw new Error('El monto recibido no es válido');
            }

            const metodoPago = await prisma.metodoPago.findFirst({
                where: { id: Number(metodoPagoId), deletedAt: null },
            });
            if (!metodoPago) throw new Error('El método de pago especificado no existe');
            if (String(metodoPago.estado).toLowerCase() !== 'activo')
                throw new Error(`El método de pago "${metodoPago.nombre}" no está activo`);

            // Empleado vinculado al usuario en sesión (si existe)
            const empleadoSesion = req.usuario?.id
                ? await prisma.empleado.findFirst({
                      where: { usuarioId: req.usuario.id, deletedAt: null },
                      select: { id: true },
                  })
                : null;

            const apertura = await this.resolverAperturaActiva({ aperturaCajaId, empleadoId, empleadoSesion });

            // El empleado de la sesión tiene prioridad (evita suplantar al cajero desde el body)
            const empleadoVentaId = empleadoSesion?.id ?? (empleadoId ? Number(empleadoId) : apertura.empleadoId);
            const empleado = await prisma.empleado.findFirst({
                where: { id: empleadoVentaId, deletedAt: null },
                select: { id: true },
            });
            if (!empleado) throw new Error('El empleado especificado no existe');

            let clienteVentaId = null;
            if (clienteId !== undefined && clienteId !== null && clienteId !== '') {
                const cliente = await prisma.cliente.findFirst({
                    where: { id: Number(clienteId), deletedAt: null },
                    select: { id: true },
                });
                if (!cliente) throw new Error('El cliente especificado no existe');
                clienteVentaId = cliente.id;
            }

            const esEfectivo = esMetodoEfectivo(metodoPago.nombre);

            const ventaId = await prisma.$transaction(async (tx) => {
                const productos = await tx.producto.findMany({
                    where: { id: { in: partidas.map((p) => p.productoId) }, deletedAt: null },
                });
                const productosPorId = new Map(productos.map((p) => [p.id, p]));

                const lineas = partidas.map((partida) => {
                    const producto = productosPorId.get(partida.productoId);
                    if (!producto) throw new Error(`El producto #${partida.productoId} no existe`);
                    if (String(producto.estado).toLowerCase() !== 'activo')
                        throw new Error(`El producto "${producto.nombre}" no está activo`);
                    if (producto.stockActual < partida.cantidad)
                        throw new Error(
                            `Stock insuficiente para "${producto.nombre}". Disponible: ${producto.stockActual}, solicitado: ${partida.cantidad}`
                        );

                    const precioUnitario = redondear(producto.precioVenta);
                    return {
                        productoId: producto.id,
                        nombre: producto.nombre,
                        cantidad: partida.cantidad,
                        precioUnitario,
                        subtotal: redondear(precioUnitario * partida.cantidad),
                    };
                });

                const subtotal = redondear(lineas.reduce((acc, l) => acc + l.subtotal, 0));
                const total = subtotal;
                if (total <= 0) throw new Error('El total de la venta debe ser mayor a 0');
                if (total > 9999999.99) throw new Error('El total de la venta no puede exceder $9,999,999.99');

                // Pago
                let recibido = total;
                let cambio = 0;
                const hayMontoRecibido = montoRecibido !== undefined && montoRecibido !== null && montoRecibido !== '';
                if (esEfectivo) {
                    if (hayMontoRecibido) recibido = redondear(montoRecibido);
                    if (recibido < total)
                        throw new Error(
                            `El monto recibido ($${recibido.toFixed(2)}) es menor al total de la venta ($${total.toFixed(2)})`
                        );
                    cambio = redondear(recibido - total);
                } else if (hayMontoRecibido && redondear(montoRecibido) !== total) {
                    throw new Error('Para pagos que no son en efectivo el monto debe ser igual al total de la venta');
                }

                // Descuento de inventario atómico: solo descuenta si todavía hay stock suficiente
                for (const linea of lineas) {
                    const actualizado = await tx.producto.updateMany({
                        where: { id: linea.productoId, stockActual: { gte: linea.cantidad } },
                        data: { stockActual: { decrement: linea.cantidad } },
                    });
                    if (actualizado.count !== 1)
                        throw new Error(`Stock insuficiente para "${linea.nombre}". Intenta de nuevo`);
                }

                const venta = await tx.venta.create({
                    data: {
                        // Folio temporal único; se reemplaza por el definitivo al conocer el id
                        folio: `TMP-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
                        aperturaCajaId: apertura.id,
                        empleadoId: empleado.id,
                        clienteId: clienteVentaId,
                        metodoPagoId: metodoPago.id,
                        subtotal,
                        total,
                        montoRecibido: recibido,
                        cambio,
                        estado: ESTADO_VENTA_COMPLETADA,
                        observaciones: observaciones ? String(observaciones).trim() : null,
                        detalles: {
                            create: lineas.map((l) => ({
                                productoId: l.productoId,
                                cantidad: l.cantidad,
                                precioUnitario: l.precioUnitario,
                                subtotal: l.subtotal,
                            })),
                        },
                    },
                    select: { id: true, fechaVenta: true },
                });

                const yyyymmdd = venta.fechaVenta.toISOString().slice(0, 10).replaceAll('-', '');
                await tx.venta.update({
                    where: { id: venta.id },
                    data: { folio: `VTA-${yyyymmdd}-${String(venta.id).padStart(6, '0')}` },
                });

                return venta.id;
            });

            const registro = await this.dao.getById(ventaId);
            return this.respuestaExito(res, this.conComprobante(registro), 'Venta registrada correctamente');
        } catch (error) {
            return this.manejarError(res, error);
        }
    };

    // ── GET /api/ventas ──────────────────────────────────────────────────────
    /**
     * Listado con filtros opcionales por query string:
     * fechaDesde, fechaHasta (YYYY-MM-DD), clienteId, metodoPagoId, estado,
     * aperturaCajaId, empleadoId.
     */
    obtenerTodos = async (req, res) => {
        try {
            const where = this.construirFiltros(req.query ?? {});
            const registros = await this.dao.getAll(where);
            return this.respuestaExito(res, registros, 'Ventas obtenidas exitosamente');
        } catch (error) {
            return this.manejarError(res, error);
        }
    };

    // ── GET /api/ventas/:id ──────────────────────────────────────────────────
    /** Detalle de la venta con sus partidas y el comprobante listo para imprimir. */
    obtenerPorId = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!Number.isInteger(id) || id <= 0) throw new Error('ID no válido');

            const registro = await this.dao.getById(id);
            if (!registro) return this.respuestaNoEncontrado(res, 'Venta no encontrada');

            return this.respuestaExito(res, this.conComprobante(registro), 'Venta obtenida exitosamente');
        } catch (error) {
            return this.manejarError(res, error);
        }
    };

    // ── POST /api/ventas/:id/cancelar ────────────────────────────────────────
    /**
     * Cancela una venta COMPLETADA y revierte el inventario.
     * Reglas:
     *  - requiere un motivo,
     *  - no se puede cancelar una venta ya cancelada,
     *  - no se puede cancelar si la caja ya fue cerrada (ya existe un corte),
     *  - si fue en efectivo, la caja debe tener efectivo suficiente para devolver el dinero.
     */
    cancelar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!Number.isInteger(id) || id <= 0) throw new Error('ID no válido');

            const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo.trim() : '';
            if (motivo.length < MIN_MOTIVO_CANCELACION)
                throw new Error(`El motivo de cancelación es requerido (mínimo ${MIN_MOTIVO_CANCELACION} caracteres)`);
            if (motivo.length > MAX_MOTIVO_CANCELACION)
                throw new Error(`El motivo de cancelación no puede exceder ${MAX_MOTIVO_CANCELACION} caracteres`);

            await prisma.$transaction(async (tx) => {
                const venta = await tx.venta.findFirst({
                    where: { id, deletedAt: null },
                    include: {
                        metodoPago: { select: { nombre: true } },
                        aperturaCaja: { select: { id: true, estado: true, montoInicial: true } },
                        detalles: { where: { deletedAt: null } },
                    },
                });
                if (!venta) throw new NoEncontradoError('Venta no encontrada');
                if (venta.estado === ESTADO_VENTA_CANCELADA) throw new Error('La venta ya fue cancelada');
                if (venta.aperturaCaja.estado !== 'ABIERTA')
                    throw new Error(
                        'No se puede cancelar la venta porque su caja ya fue cerrada (existe un corte de caja)'
                    );

                // Si fue en efectivo hay que devolver el dinero: la caja debe poder cubrirlo
                if (esMetodoEfectivo(venta.metodoPago?.nombre)) {
                    const totales = await obtenerTotalesApertura(venta.aperturaCajaId, tx);
                    const saldoDisponible = calcularEfectivoEsperado(venta.aperturaCaja.montoInicial, totales);
                    const aDevolver = Number(venta.total);
                    if (aDevolver > saldoDisponible)
                        throw new Error(
                            `Saldo insuficiente en caja para devolver $${aDevolver.toFixed(2)}. El saldo disponible es de $${saldoDisponible.toFixed(2)}`
                        );
                }

                // Actualización condicionada: evita doble cancelación concurrente
                const actualizada = await tx.venta.updateMany({
                    where: { id, estado: ESTADO_VENTA_COMPLETADA },
                    data: {
                        estado: ESTADO_VENTA_CANCELADA,
                        motivoCancelacion: motivo,
                        fechaCancelacion: new Date(),
                    },
                });
                if (actualizada.count !== 1) throw new Error('La venta ya fue cancelada');

                // Reversa de inventario
                for (const detalle of venta.detalles) {
                    await tx.producto.update({
                        where: { id: detalle.productoId },
                        data: { stockActual: { increment: detalle.cantidad } },
                    });
                }
            });

            const registro = await this.dao.getById(id);
            return this.respuestaExito(
                res,
                this.conComprobante(registro),
                'Venta cancelada correctamente. El inventario fue restituido'
            );
        } catch (error) {
            return this.manejarError(res, error);
        }
    };

    // ── Utilidades internas ──────────────────────────────────────────────────

    manejarError(res, error) {
        if (error instanceof NoEncontradoError) return this.respuestaNoEncontrado(res, error.message);
        return this.respuestaError(res, error);
    }

    /**
     * Determina la apertura de caja ABIERTA donde se registrará la venta.
     * - Si se envía aperturaCajaId se valida esa apertura.
     * - Si no, se usa la apertura abierta del empleado en sesión (o del empleadoId enviado).
     */
    async resolverAperturaActiva({ aperturaCajaId, empleadoId, empleadoSesion }) {
        const incluir = { caja: { select: { id: true, nombre: true } } };

        if (aperturaCajaId !== undefined && aperturaCajaId !== null && aperturaCajaId !== '') {
            if (!Number.isInteger(Number(aperturaCajaId)) || Number(aperturaCajaId) <= 0)
                throw new Error('La apertura de caja no es válida');

            const apertura = await prisma.aperturaCaja.findFirst({
                where: { id: Number(aperturaCajaId), deletedAt: null },
                include: incluir,
            });
            if (!apertura) throw new Error('La apertura de caja especificada no existe');
            if (apertura.estado !== 'ABIERTA')
                throw new Error('La caja seleccionada está cerrada. Abre una caja para registrar ventas');
            return apertura;
        }

        const empleadoBusqueda = empleadoSesion?.id ?? (empleadoId ? Number(empleadoId) : null);
        if (!empleadoBusqueda)
            throw new Error('No se pudo determinar la caja activa. Indica la apertura de caja (aperturaCajaId)');

        const apertura = await prisma.aperturaCaja.findFirst({
            where: { empleadoId: empleadoBusqueda, estado: 'ABIERTA', deletedAt: null },
            orderBy: { fechaApertura: 'desc' },
            include: incluir,
        });
        if (!apertura) throw new Error('No hay una caja abierta para registrar la venta. Abre una caja primero');
        return apertura;
    }

    /** Valida y normaliza las partidas; unifica productos repetidos sumando cantidades. */
    normalizarPartidas(items) {
        if (!Array.isArray(items) || items.length === 0)
            throw new Error('La venta debe incluir al menos un producto');
        if (items.length > MAX_PARTIDAS)
            throw new Error(`La venta no puede tener más de ${MAX_PARTIDAS} partidas`);

        const acumulado = new Map();
        for (const item of items) {
            const productoId = Number(item?.productoId);
            const cantidad = Number(item?.cantidad);
            if (!Number.isInteger(productoId) || productoId <= 0)
                throw new Error('Cada partida debe indicar un producto válido');
            if (!Number.isInteger(cantidad) || cantidad <= 0)
                throw new Error('La cantidad de cada producto debe ser un entero mayor a 0');

            const nueva = (acumulado.get(productoId) ?? 0) + cantidad;
            if (nueva > MAX_CANTIDAD_POR_PARTIDA)
                throw new Error(`La cantidad por producto no puede exceder ${MAX_CANTIDAD_POR_PARTIDA}`);
            acumulado.set(productoId, nueva);
        }
        return [...acumulado].map(([productoId, cantidad]) => ({ productoId, cantidad }));
    }

    /** Construye el filtro Prisma a partir de los parámetros de query. */
    construirFiltros({ fechaDesde, fechaHasta, clienteId, metodoPagoId, estado, aperturaCajaId, empleadoId }) {
        const where = {};

        const idValido = (valor, etiqueta) => {
            const n = Number(valor);
            if (!Number.isInteger(n) || n <= 0) throw new Error(`${etiqueta} no es válido`);
            return n;
        };
        const fechaValida = (valor, etiqueta) => {
            if (!REGEX_FECHA.test(valor) || isNaN(Date.parse(`${valor}T00:00:00`)))
                throw new Error(`${etiqueta} debe tener el formato YYYY-MM-DD`);
        };

        if (fechaDesde) fechaValida(fechaDesde, 'La fecha inicial');
        if (fechaHasta) fechaValida(fechaHasta, 'La fecha final');
        if (fechaDesde && fechaHasta && fechaDesde > fechaHasta)
            throw new Error('La fecha inicial no puede ser mayor a la fecha final');

        if (fechaDesde || fechaHasta) {
            where.fechaVenta = {
                ...(fechaDesde && { gte: new Date(`${fechaDesde}T00:00:00.000`) }),
                ...(fechaHasta && { lte: new Date(`${fechaHasta}T23:59:59.999`) }),
            };
        }
        if (clienteId) where.clienteId = idValido(clienteId, 'El cliente');
        if (metodoPagoId) where.metodoPagoId = idValido(metodoPagoId, 'El método de pago');
        if (aperturaCajaId) where.aperturaCajaId = idValido(aperturaCajaId, 'La apertura de caja');
        if (empleadoId) where.empleadoId = idValido(empleadoId, 'El empleado');
        if (estado) {
            const estadoNormalizado = String(estado).trim().toUpperCase();
            if (!ESTADOS_VALIDOS.includes(estadoNormalizado))
                throw new Error(`El estado debe ser ${ESTADOS_VALIDOS.join(' o ')}`);
            where.estado = estadoNormalizado;
        }

        return where;
    }

    /** Agrega a la venta el comprobante (ticket) con los datos listos para mostrar/imprimir. */
    conComprobante(venta) {
        const cancelada = venta.estado === ESTADO_VENTA_CANCELADA;
        return {
            ...venta,
            comprobante: {
                folio: venta.folio,
                fecha: venta.fechaVenta,
                estado: venta.estado,
                caja: venta.aperturaCaja?.caja?.nombre ?? null,
                cajero: nombreCompleto(venta.empleado),
                cliente: nombreCompleto(venta.cliente) ?? 'Público en general',
                metodoPago: venta.metodoPago?.nombre ?? null,
                conceptos: (venta.detalles ?? []).map((d) => ({
                    productoId: d.productoId,
                    producto: d.producto?.nombre ?? null,
                    codigoBarras: d.producto?.codigoBarras ?? null,
                    cantidad: d.cantidad,
                    precioUnitario: Number(d.precioUnitario),
                    subtotal: Number(d.subtotal),
                })),
                subtotal: Number(venta.subtotal),
                total: Number(venta.total),
                montoRecibido: Number(venta.montoRecibido),
                cambio: Number(venta.cambio),
                observaciones: venta.observaciones ?? null,
                cancelacion: cancelada
                    ? { motivo: venta.motivoCancelacion, fecha: venta.fechaCancelacion }
                    : null,
            },
        };
    }
}

export const ventaController = new VentaController();
