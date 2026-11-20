
import { ventaDao } from '../dao/VentaDao.js';
import { BaseController } from './BaseController.js';
import { ResponseModel } from '../modelos/ResponseModel.js';
import { pagoService } from '../services/PagoService.js';

export class VentaController extends BaseController {
    constructor() {
        super(ventaDao);
    }

    obtenerTodos = async (req, res) => {
        try {
            const pagina = Number(req.query.pagina ?? 1);
            const limiteSolicitado = Number(req.query.limite ?? 20);
            const clienteId = req.query.clienteId === undefined
                ? undefined
                : this.leerId(req.query.clienteId, 'cliente');
            const cliente = typeof req.query.cliente === 'string'
                ? req.query.cliente.trim()
                : '';
            const busqueda = typeof req.query.q === 'string' ? req.query.q.trim() : '';
            const estado = req.query.estado;
            const metodoPagoId = req.query.metodoPagoId === undefined
                ? undefined
                : this.leerId(req.query.metodoPagoId, 'método de pago');
            const fechaDesde = this.leerFecha(req.query.fechaDesde, 'fecha desde');
            const fechaHasta = this.leerFecha(req.query.fechaHasta, 'fecha hasta');
            const aperturaCajaId = req.query.aperturaCajaId === undefined
                ? undefined
                : Number(req.query.aperturaCajaId);
            const empresaId = this.obtenerEmpresaId(req);
            const sucursalId = this.obtenerSucursalId(req);

            if (
                !Number.isSafeInteger(pagina) || pagina < 1
                || !Number.isSafeInteger(limiteSolicitado) || limiteSolicitado < 1
                || (aperturaCajaId !== undefined && (!Number.isSafeInteger(aperturaCajaId) || aperturaCajaId < 1))
                || (req.query.cliente !== undefined && typeof req.query.cliente !== 'string')
                || cliente.length > 100
                || (req.query.q !== undefined && typeof req.query.q !== 'string')
                || busqueda.length > 100
                || (estado !== undefined && !['completada', 'cancelada', 'pendiente_pago', 'reembolsado'].includes(estado))
                || (fechaDesde && fechaHasta && fechaDesde > fechaHasta)
            ) {
                return res.status(400).json(new ResponseModel(
                    null,
                    1,
                    'Los filtros o parámetros de paginación no son válidos',
                    400
                ));
            }

            const resultado = await this.dao.obtenerVentas({
                pagina,
                limite: Math.min(limiteSolicitado, 100),
                clienteId,
                cliente,
                busqueda,
                fechaDesde,
                fechaHasta,
                metodoPagoId,
                estado,
                aperturaCajaId,
                empresaId,
                sucursalId,
            });

            const ventasPendientes = (resultado.registros ?? []).filter(
                (v) => String(v.estado ?? '').toLowerCase() === 'pendiente_pago'
            );
            if (ventasPendientes.length > 0) {
                await Promise.allSettled(
                    ventasPendientes.map((v) => pagoService.consultarEstadoVenta(v.id, empresaId).catch(() => null))
                );
                const recargados = await this.dao.obtenerVentas({
                    pagina,
                    limite: Math.min(limiteSolicitado, 100),
                    clienteId,
                    cliente,
                    busqueda,
                    fechaDesde,
                    fechaHasta,
                    metodoPagoId,
                    estado,
                    aperturaCajaId,
                    empresaId,
                    sucursalId,
                });
                return this.respuestaExito(res, recargados, 'Ventas obtenidas correctamente');
            }

            return this.respuestaExito(res, resultado, 'Ventas obtenidas correctamente');
        } catch (error) {
            if (error.status === 400) {
                return res.status(400).json(new ResponseModel(null, 1, error.message, 400));
            }
            return this.respuestaError(res, error);
        }
    };

    obtenerResumen = async (req, res) => {
        try {
            const aperturaCajaId = req.query.aperturaCajaId === undefined
                ? undefined
                : Number(req.query.aperturaCajaId);
            if (
                aperturaCajaId !== undefined
                && (!Number.isSafeInteger(aperturaCajaId) || aperturaCajaId < 1)
            ) {
                return res.status(400).json(new ResponseModel(
                    null,
                    1,
                    'El ID de apertura de caja no es válido',
                    400
                ));
            }

            const resumen = await this.dao.obtenerResumenHistorial({
                aperturaCajaId,
                empresaId: this.obtenerEmpresaId(req),
                sucursalId: this.obtenerSucursalId(req),
            });
            return this.respuestaExito(res, resumen, 'Resumen de ventas obtenido correctamente');
        } catch (error) {
            if (error.status === 400) {
                return res.status(400).json(new ResponseModel(null, 1, error.message, 400));
            }
            return this.respuestaError(res, error);
        }
    };

    create = async (req, res) => {
        try {
            const {
                empleadoId,
                aperturaCajaId,
                metodoPagoId,
                detalleVenta,
                subtotal,
                total,
                montoRecibido,
            } = req.body;

            let clienteId = req.body.clienteId ?? req.body.clientId;

            // Si es un cliente autenticado o no se envió clienteId, resolver cliente asociado
            if (!clienteId && req.usuario?.id) {
                const clienteAsociado = await this.dao.prisma.cliente.findFirst({
                    where: { usuarioId: Number(req.usuario.id), deletedAt: null },
                    select: { id: true },
                });
                if (clienteAsociado) {
                    clienteId = clienteAsociado.id;
                }
            }

            // Si aún no hay clienteId (ej. venta rápida en mostrador), tomar el primer cliente activo
            if (!clienteId) {
                const primerCliente = await this.dao.prisma.cliente.findFirst({
                    where: { deletedAt: null },
                    orderBy: { id: 'asc' },
                    select: { id: true },
                });
                if (primerCliente) {
                    clienteId = primerCliente.id;
                }
            }

            // Si es pedido en línea (sin caja o empleado explícito), asociar a la caja abierta de la sucursal
            let idAperturaFinal = aperturaCajaId ? Number(aperturaCajaId) : null;
            let idEmpleadoFinal = empleadoId ? Number(empleadoId) : null;

            if (!idAperturaFinal || !idEmpleadoFinal) {
                const sucursalId = this.obtenerSucursalId(req);
                const cajaActiva = await this.dao.prisma.aperturaCaja.findFirst({
                    where: {
                        sucursalId: Number(sucursalId),
                        estado: 'ABIERTA',
                        deletedAt: null,
                    },
                    orderBy: { id: 'desc' },
                });

                if (cajaActiva) {
                    idAperturaFinal = idAperturaFinal || cajaActiva.id;
                    idEmpleadoFinal = idEmpleadoFinal || cajaActiva.empleadoId;
                } else {
                    const cajaCualquiera = await this.dao.prisma.aperturaCaja.findFirst({
                        where: {
                            empresaId: this.obtenerEmpresaId(req),
                            estado: 'ABIERTA',
                            deletedAt: null,
                        },
                        orderBy: { id: 'desc' },
                    });
                    if (cajaCualquiera) {
                        idAperturaFinal = idAperturaFinal || cajaCualquiera.id;
                        idEmpleadoFinal = idEmpleadoFinal || cajaCualquiera.empleadoId;
                    }
                }
            }

            this.validar(idAperturaFinal, clienteId, detalleVenta);

            const rawUuid = req.get('x-idempotency-key') ?? req.body.uuidIdempotencia;
            const uuidIdempotencia = this.sanitizarUuid(rawUuid);

            const registro = await this.dao.create({
                empleadoId: this.leerId(idEmpleadoFinal, 'empleado'),
                aperturaCajaId: Number(idAperturaFinal),
                clienteId: Number(clienteId),
                usuarioId: this.leerId(req.usuario?.id, 'usuario autenticado'),
                empresaId: this.obtenerEmpresaId(req),
                uuidIdempotencia,
                metodoPagoId: this.leerId(metodoPagoId, 'método de pago'),
                subtotal: this.leerMonto(subtotal, 'subtotal'),
                total: this.leerMonto(total, 'total'),
                montoRecibido: montoRecibido === undefined ? undefined : this.leerMonto(montoRecibido, 'monto recibido'),
                detalleVenta: this.normalizarDetalles(detalleVenta),
                pago: this.sanitizarPago(req.body.pago),
            });

            return this.respuestaExito(
                res,
                registro,
                'Venta creada correctamente'
            );
        } catch (error) {
            if (error.code === 'APERTURA_CAJA_CERRADA') {
                return res.status(error.status).json(new ResponseModel(
                    { code: error.code },
                    1,
                    error.message,
                    error.status
                ));
            }
            if ([400, 403, 409, 502, 503].includes(error.status)) {
                return res.status(error.status).json(new ResponseModel(
                    null,
                    1,
                    error.message,
                    error.status
                ));
            }
            return this.respuestaError(res, error);
        }
    };

    consultarEstadoPago = async (req, res) => {
        try {
            const ventaId = this.leerId(req.params.id, 'venta');
            const paymentId = typeof req.query.payment_id === 'string'
                ? req.query.payment_id
                : typeof req.query.collection_id === 'string'
                    ? req.query.collection_id
                    : null;
            const resultado = await pagoService.consultarEstadoVenta(
                ventaId,
                this.obtenerEmpresaId(req),
                paymentId
            );
            return this.respuestaExito(res, resultado, 'Estado del pago consultado correctamente');
        } catch (error) {
            if ([400, 401, 403, 404, 409, 502, 503].includes(error.status)) {
                return res.status(error.status).json(new ResponseModel(
                    null,
                    1,
                    error.message,
                    error.status
                ));
            }
            return this.respuestaError(res, error);
        }
    };

    crearCheckoutPago = async (req, res) => {
        try {
            const ventaId = this.leerId(req.params.id, 'venta');
            const pago = await pagoService.prepararCheckoutVenta(
                ventaId,
                this.obtenerEmpresaId(req)
            );
            return this.respuestaExito(res, pago, 'Checkout de Mercado Pago listo');
        } catch (error) {
            if ([400, 404, 409, 502, 503].includes(error.status)) {
                return res.status(error.status).json(new ResponseModel(
                    null,
                    1,
                    error.message,
                    error.status
                ));
            }
            return this.respuestaError(res, error);
        }
    };

    cancel = async (req, res) => {
        try {
            const id = this.leerId(req.params.id);
            const motivoCancelacion = req.body?.motivoCancelacion;
            const folioCancelacion = req.body?.folioCancelacion;
            const confirmacionTerminal = req.body?.confirmacionTerminal;
            if (
                typeof motivoCancelacion !== 'string'
                || !motivoCancelacion.trim()
                || motivoCancelacion.trim().length > 500
            ) {
                return res.status(400).json(new ResponseModel(
                    null,
                    1,
                    'El motivo de cancelación es obligatorio y no debe exceder 500 caracteres',
                    400
                ));
            }

            const respuesta = await this.dao.cancel(id, motivoCancelacion.trim(), {
                folioCancelacion,
                confirmacionTerminal,
            });

            return this.respuestaExito(
                res,
                respuesta,
                'Se canceló la venta con éxito'
            );
        } catch (error) {
            if ([400, 409, 422, 502, 503].includes(error.status)) {
                const detalles = { ...(error.code ? { code: error.code } : {}), ...(error.data ?? {}) };
                return res.status(error.status).json(new ResponseModel(
                    Object.keys(detalles).length > 0 ? detalles : null,
                    1,
                    error.message,
                    error.status
                ));
            }
            return this.respuestaError(res, error);
        }
    };

normalizarDetalles(detalleVenta) {
    if (!Array.isArray(detalleVenta)) {
        throw new Error("El detalle de la venta no es válido");
    }

    return detalleVenta.map((d) => {
        const tipoItem = String(d.tipoItem ?? "").trim().toUpperCase();
        const cantidad = Number(d.cantidad);

        if (!Number.isInteger(cantidad) || cantidad <= 0) {
            throw new Error("La cantidad debe ser un entero mayor que cero");
        }

        const detalle = {
            tipoItem,
            cantidad,
            descripcion: typeof d.descripcion === 'string'
                ? d.descripcion.replace(/<[^>]*>/g, '').replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 255)
                : null,
            productoId: null,
            servicioId: null,
            tipoMembresiaId: null
        };

        switch (tipoItem) {
            case "PRODUCTO":
                detalle.productoId = Number(d.productoId);

                if (!Number.isInteger(detalle.productoId) || detalle.productoId <= 0) {
                    throw new Error("El productoId es obligatorio y debe ser válido");
                }
                break;

            case "SERVICIO":
                detalle.servicioId = Number(d.servicioId);

                if (!Number.isInteger(detalle.servicioId) || detalle.servicioId <= 0) {
                    throw new Error("El servicioId es obligatorio y debe ser válido");
                }
                break;

            case "MEMBRESIA":
                detalle.tipoMembresiaId = Number(d.tipoMembresiaId);

                if (!Number.isInteger(detalle.tipoMembresiaId) || detalle.tipoMembresiaId <= 0) {
                    throw new Error("El tipoMembresiaId es obligatorio y debe ser válido");
                }
                break;

            default:
                throw new Error(`Tipo de artículo no válido: ${tipoItem}`);
        }

        return detalle;
    });
}

    validar(aperturaCajaId, clienteId, detalleVenta) {
        const aperturaId = Number(aperturaCajaId);
        const idCliente = Number(clienteId);

        if (
            aperturaCajaId === undefined ||
            aperturaCajaId === null ||
            aperturaCajaId === '' ||
            !Number.isInteger(aperturaId) ||
            aperturaId <= 0
        ) {
            throw new Error('La apertura de caja es requerida');
        }

        if (
            clienteId === undefined ||
            clienteId === null ||
            clienteId === '' ||
            !Number.isInteger(idCliente) ||
            idCliente <= 0
        ) {
            throw new Error('El cliente es requerido');
        }

        if (!Array.isArray(detalleVenta) || detalleVenta.length === 0) {
            throw new Error(
                'La venta debe contener al menos un artículo'
            );
        }
    }

    leerId = (valor, entidad = 'venta') => {
        const id = Number(valor);

        if (!Number.isInteger(id) || id <= 0) {
            const error = new Error(
                `El identificador del ${entidad} no es válido`
            );
            error.status = 400;
            throw error;
        }

        return id;
    };

    leerMonto = (valor, nombre) => {
        const n = Number(valor);

        if (valor === undefined || valor === null || valor === '' || !Number.isFinite(n) || n < 0) {
            throw new Error(`El ${nombre} es requerido y debe ser un monto válido`);
        }

    return n;
};

    leerFecha = (valor, nombre) => {
        if (valor === undefined || valor === '') return undefined;
        if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
            const error = new Error(`El ${nombre} no es válido`);
            error.status = 400;
            throw error;
        }

        const [anio, mes, dia] = valor.split('-').map(Number);
        const fecha = new Date(Date.UTC(anio, mes - 1, dia));
        if (
            fecha.getUTCFullYear() !== anio
            || fecha.getUTCMonth() !== mes - 1
            || fecha.getUTCDate() !== dia
        ) {
            const error = new Error(`El ${nombre} no es válido`);
            error.status = 400;
            throw error;
        }

        if (nombre === 'fecha hasta') fecha.setUTCHours(23, 59, 59, 999);
        return fecha;
    };

    sanitizarPago = (pago) => {
        if (!pago || typeof pago !== 'object' || Array.isArray(pago)) return pago;
        const sanitizado = {};
        for (const [clave, valor] of Object.entries(pago)) {
            if (typeof valor === 'string') {
                sanitizado[clave] = valor
                    .replace(/<[^>]*>/g, '')
                    .replace(/[\x00-\x1F\x7F]/g, '')
                    .trim()
                    .slice(0, 255);
            } else {
                sanitizado[clave] = valor;
            }
        }
        return sanitizado;
    };

    sanitizarUuid = (uuid) => {
        if (typeof uuid !== 'string') return undefined;
        const limpio = uuid.trim().replace(/[^a-zA-Z0-9\-_]/g, '').slice(0, 100);
        return limpio.length > 0 ? limpio : undefined;
    };
}

export const ventaController = new VentaController();
