import currency from 'currency.js';
import { prisma } from './BaseDao.js';
import { TASA_IVA } from '../utils/constantes.js';


function crearError(mensaje, status = 400, code, data = null) {
    const error = new Error(mensaje);
    error.status = status;
    if (code) {
        error.code = code;
    }
    if (data) {
        error.data = data;
    }
    return error;
}

function validarIdVenta(ventaId) {
    const idVenta = Number(ventaId);
    if (!Number.isSafeInteger(idVenta) || idVenta <= 0) {
        throw crearError('ID de venta no válido');
    }
    return idVenta;
}

async function obtenerVentaElegible(tx, idVenta) {
    const venta = await tx.venta.findFirst({
        where: { id: idVenta, deletedAt: null },
        select: {
            id: true,
            estado: true,
            total: true,
            metodoPagoId: true,
            folioVentaId: true,
        },
    });
    if (!venta) {
        throw crearError('La venta no existe', 404, 'VENTA_NO_ENCONTRADA');
    }

    const estadoVenta = String(venta.estado ?? '').trim().toLowerCase();
    if (!['completada', 'completado'].includes(estadoVenta)) {
        throw crearError('Solo se pueden devolver ventas completadas y no canceladas', 409, 'VENTA_NO_DEVOLVIBLE');
    }

    let metodoPago;
    if (venta.metodoPagoId !== null) {
        metodoPago = await tx.metodoPago.findUnique({
            where: { id: venta.metodoPagoId },
            select: { id: true, codigo: true, nombre: true },
        });
    }
    if (!metodoPago) {
        throw crearError('No se pudo identificar el método de pago original de la venta');
    }

    const transaccionPago = await tx.transaccionPago.findFirst({
        where: { ventaId: idVenta, deletedAt: null },
        orderBy: { id: 'desc' },
        select: {
            id: true,
            proveedor: true,
            estado: true,
            monto: true,
            montoReembolsado: true,
        },
    });

    return { venta, metodoPago, transaccionPago };
}

async function obtenerEstadoDetallesVenta(tx, idVenta) {
    const detallesVenta = await tx.detalleVenta.findMany({
        where: { ventaId: idVenta },
        select: {
            id: true,
            tipoItem: true,
            productoId: true,
            servicioId: true,
            tipoMembresiaId: true,
            descripcion: true,
            cantidad: true,
            precioUnitario: true,
            descuentoUnitario: true,
            producto: { select: { nombre: true } },
            servicio: { select: { nombre: true } },
            tipoMembresia: { select: { nombre: true } },
        },
    });
    const idsDetalle = detallesVenta.map((detalle) => detalle.id);
    const devolucionesAnteriores = idsDetalle.length === 0
        ? []
        : await tx.devolucionDetalle.findMany({
            where: {
                detalleVentaId: { in: idsDetalle },
                devolucion: {
                    is: {
                        estadoReembolso: { in: ['PENDIENTE_REEMBOLSO', 'COMPLETADA'] },
                    },
                },
            },
            select: {
                detalleVentaId: true,
                cantidad: true,
                monto: true,
            },
        });

    const cantidadesDevueltas = new Map();
    let montoDevueltoAnterior = currency(0);
    for (const detalle of devolucionesAnteriores) {
        cantidadesDevueltas.set(
            detalle.detalleVentaId,
            (cantidadesDevueltas.get(detalle.detalleVentaId) ?? 0) + Number(detalle.cantidad)
        );
        montoDevueltoAnterior = montoDevueltoAnterior.add(Number(detalle.monto));
    }

    return { detallesVenta, cantidadesDevueltas, montoDevueltoAnterior };
}

function aCentavos(monto) {
    const valor = Number(monto);
    if (!Number.isFinite(valor)) {
        throw crearError('El monto del reembolso no es válido');
    }
    return Math.round(valor * 100);
}

function esMetodoTerminal(metodoPago, transaccionPago) {
    return metodoPago.codigo === 'TARJETA' || transaccionPago?.proveedor === 'TERMINAL_MANUAL';
}

async function obtenerMetodoPagoReembolso(tx, metodoPago) {
    if (metodoPago.codigo !== 'MERCADO_PAGO') {
        return metodoPago;
    }

    const metodoEfectivo = await tx.metodoPago.findFirst({
        where: { codigo: 'EFECTIVO', deletedAt: null },
        select: { id: true, codigo: true, nombre: true },
    });
    if (!metodoEfectivo) {
        throw crearError('No está configurado el método de pago Efectivo para registrar el reembolso.', 409);
    }
    return metodoEfectivo;
}

export async function validarReembolso(tx, {
    ventaId,
    metodoPago,
    transaccionPago,
    monto,
    folioCancelacion,
    confirmacionTerminal,
}) {
    if (!transaccionPago) {
        throw crearError('La venta no tiene una transacción de pago asociada; no se puede validar el reembolso.', 409);
    }

    if (transaccionPago.estado !== 'APROBADO') {
        if (metodoPago.codigo === 'TRANSFERENCIA' && transaccionPago.estado === 'PENDIENTE') {
            throw crearError('No se puede devolver una transferencia mientras su pago siga pendiente.', 409);
        }
        throw crearError(`No se puede reembolsar un pago en estado ${transaccionPago.estado}.`, 409);
    }

    const total = aCentavos(transaccionPago.monto);
    const reembolsado = aCentavos(transaccionPago.montoReembolsado ?? 0);
    const pendientes = await tx.devolucion.aggregate({
        where: { ventaId, estadoReembolso: 'PENDIENTE_REEMBOLSO' },
        _sum: { monto: true },
    });
    const reservado = aCentavos(pendientes._sum?.monto ?? 0);
    if (reembolsado + reservado + aCentavos(monto) > total) {
        throw crearError(
            'El monto solicitado excede el saldo que queda por reembolsar de la transacción.',
            409,
            'MONTO_REEMBOLSO_EXCEDIDO'
        );
    }

    if (metodoPago.codigo === 'MERCADO_PAGO') {
        if (transaccionPago.proveedor !== 'MERCADO_PAGO') {
            throw crearError('El proveedor del pago no coincide con Mercado Pago.', 409);
        }
        return { metodoPagoReembolso: await obtenerMetodoPagoReembolso(tx, metodoPago) };
    }

    if (esMetodoTerminal(metodoPago, transaccionPago)) {
        if (transaccionPago.proveedor !== 'TERMINAL_MANUAL') {
            throw crearError('El proveedor del pago no coincide con la terminal.', 409);
        }
        if (confirmacionTerminal !== true) {
            throw crearError('Confirma que el pago ya fue cancelado en la terminal.', 400);
        }
        if (typeof folioCancelacion !== 'string' || !folioCancelacion.trim()) {
            throw crearError('El folio de cancelación de la terminal es obligatorio.', 400);
        }
        if (folioCancelacion.trim().length > 100) {
            throw crearError('El folio de cancelación no debe exceder 100 caracteres.', 400);
        }
        return { metodoPagoReembolso: metodoPago };
    }

    if (metodoPago.codigo === 'EFECTIVO' && transaccionPago.proveedor !== 'EFECTIVO') {
        throw crearError('El proveedor del pago no coincide con efectivo.', 409);
    }
    if (metodoPago.codigo === 'TRANSFERENCIA') {
        if (transaccionPago.proveedor !== 'TRANSFERENCIA') {
            throw crearError('El proveedor del pago no coincide con transferencia.', 409);
        }
    } else if (metodoPago.codigo !== 'EFECTIVO') {
        throw crearError(`El método de pago "${metodoPago.codigo}" no admite devoluciones en este flujo.`, 409);
    }

    return { metodoPagoReembolso: metodoPago };
}

async function aplicarStockDevolucion(tx, detalles) {
    for (const detalle of detalles) {
        if (!detalle.regresaAStock) continue;
        if (!Number.isSafeInteger(detalle.productoId) || detalle.productoId <= 0) {
            throw crearError('La línea marcada para regresar al inventario no tiene un producto válido');
        }

        const productoActualizado = await tx.producto.updateMany({
            where: { id: detalle.productoId, deletedAt: null },
            data: { stockActual: { increment: detalle.cantidad } },
        });
        if (productoActualizado.count !== 1) {
            throw crearError(`No se pudo regresar al inventario el producto ${detalle.productoId}`, 409);
        }
    }
}

export async function completarReembolso(tx, {
    devolucionId,
    ventaId,
    apertura,
    metodoPago,
    metodoPagoReembolso = metodoPago,
    transaccionPago,
    monto,
    folioCancelacion,
    detallesStock = [],
    cancelacion = null,
    origenMovimiento = 'DEVOLUCION',
    conceptoMovimiento = null,
}) {
    const devolucionActual = await tx.devolucion.findUnique({
        where: { id: devolucionId },
        select: { id: true, estadoReembolso: true },
    });
    if (!devolucionActual) {
        throw crearError('No se encontró el reembolso que se debe completar.', 404);
    }
    if (devolucionActual.estadoReembolso === 'COMPLETADA') {
        return tx.devolucion.findUnique({
            where: { id: devolucionId },
            include: { detalles: true, movimientoCaja: true, metodoPago: true },
        });
    }
    if (devolucionActual.estadoReembolso !== 'PENDIENTE_REEMBOLSO') {
        throw crearError('El reembolso ya no está pendiente.', 409);
    }

    const pagoActual = await tx.transaccionPago.findFirst({
        where: { id: transaccionPago.id, deletedAt: null },
        select: { id: true, monto: true, montoReembolsado: true, estado: true },
    });
    if (!pagoActual) {
        throw crearError('No se encontró la transacción de pago que se debe actualizar.', 404);
    }
    const nuevoMontoReembolsado = aCentavos(pagoActual.montoReembolsado ?? 0) + aCentavos(monto);
    const montoPago = aCentavos(pagoActual.monto);
    const otrosReembolsosPendientes = await tx.devolucion.aggregate({
        where: {
            ventaId,
            id: { not: devolucionId },
            estadoReembolso: 'PENDIENTE_REEMBOLSO',
        },
        _sum: { monto: true },
    });
    const montoReservado = aCentavos(otrosReembolsosPendientes._sum?.monto ?? 0);
    if (nuevoMontoReembolsado + montoReservado > montoPago) {
        throw crearError('El reembolso excede el monto total de la transacción.', 409, 'MONTO_REEMBOLSO_EXCEDIDO');
    }
    if (pagoActual.estado !== 'APROBADO') {
        throw crearError(`La transacción cambió a estado ${pagoActual.estado} durante el reembolso.`, 409);
    }

    await aplicarStockDevolucion(tx, detallesStock);
    await tx.movimientoCaja.create({
        data: {
            empresaId: Number(apertura.empresaId),
            sucursalId: Number(apertura.sucursalId),
            aperturaCajaId: Number(apertura.id),
            empleadoId: Number(apertura.empleadoId),
            tipo: 'SALIDA',
            origen: origenMovimiento,
            monto,
            concepto: conceptoMovimiento
                || `Devolución de venta #${ventaId} (${metodoPagoReembolso.nombre || metodoPagoReembolso.codigo})`,
            estado: 'VALIDADO',
            afectaEfectivo: metodoPagoReembolso.codigo === 'EFECTIVO',
            ventaId,
            transaccionPagoId: transaccionPago.id,
            devolucionId,
        },
    });
    await tx.transaccionPago.update({
        where: { id: transaccionPago.id },
        data: {
            montoReembolsado: nuevoMontoReembolsado / 100,
            ...(nuevoMontoReembolsado === montoPago ? { estado: 'REEMBOLSADO' } : {}),
        },
    });
    await tx.devolucion.update({
        where: { id: devolucionId },
        data: {
            metodoPagoId: metodoPagoReembolso.id,
            estadoReembolso: 'COMPLETADA',
            folioCancelacion: folioCancelacion?.trim() || null,
            motivoFallo: null,
        },
    });
    if (cancelacion) {
        await tx.venta.update({
            where: { id: ventaId },
            data: {
                estado: 'cancelada',
                motivoCancelacion: cancelacion.motivo,
            },
        });
    }

    return tx.devolucion.findUnique({
        where: { id: devolucionId },
        include: { detalles: true, movimientoCaja: true, metodoPago: true },
    });
}

function validarCotizacion(calculo, montoPrevisualizado, cantidadesDevueltasPrevisualizadas) {
    if (
        (typeof montoPrevisualizado !== 'number' && typeof montoPrevisualizado !== 'string')
        || String(montoPrevisualizado).trim() === ''
        || !Number.isFinite(Number(montoPrevisualizado))
        || Number(montoPrevisualizado) < 0
        || !Array.isArray(cantidadesDevueltasPrevisualizadas)
    ) {
        throw crearError(
            'Se requiere la cotización previa de la devolución',
            400,
            'COTIZACION_REQUERIDA'
        );
    }

    const cantidadesPrevias = new Map();
    for (const detalle of cantidadesDevueltasPrevisualizadas) {
        const detalleVentaId = Number(detalle?.detalleVentaId);
        const cantidadDevuelta = Number(detalle?.cantidadDevuelta);
        if (
            !Number.isSafeInteger(detalleVentaId)
            || detalleVentaId <= 0
            || !Number.isSafeInteger(cantidadDevuelta)
            || cantidadDevuelta < 0
            || cantidadesPrevias.has(detalleVentaId)
        ) {
            throw crearError('Las cantidades de la cotización previa no son válidas');
        }
        cantidadesPrevias.set(detalleVentaId, cantidadDevuelta);
    }

    const cantidadesActuales = calculo.cantidadesDevueltasPorDetalle;
    const cantidadesCambiaron = cantidadesPrevias.size !== cantidadesActuales.length
        || cantidadesActuales.some((detalle) => (
            cantidadesPrevias.get(detalle.detalleVentaId) !== detalle.cantidadDevuelta
        ));
    const montoCambio = currency(montoPrevisualizado).intValue !== currency(calculo.montoTotal).intValue;
    if (cantidadesCambiaron || montoCambio) {
        throw crearError(
            'La cotización cambió porque la venta o sus devoluciones fueron actualizadas. Vuelve a cargar los datos y confirma de nuevo.',
            409,
            'COTIZACION_DESACTUALIZADA'
        );
    }
}

export async function obtenerDisponibilidadDevolucion(ventaId, client = prisma) {
    const idVenta = validarIdVenta(ventaId);
    return client.$transaction(async (tx) => {
        const { metodoPago } = await obtenerVentaElegible(tx, idVenta);
        const { detallesVenta, cantidadesDevueltas } = await obtenerEstadoDetallesVenta(tx, idVenta);

        return {
            ventaId: idVenta,
            metodoPago,
            detalles: detallesVenta.map((detalle) => {
                const cantidadDevuelta = cantidadesDevueltas.get(detalle.id) ?? 0;
                const esMembresia = detalle.tipoItem === 'MEMBRESIA';
                return {
                    detalleVentaId: detalle.id,
                    tipoItem: detalle.tipoItem,
                    productoId: detalle.productoId,
                    servicioId: detalle.servicioId,
                    tipoMembresiaId: detalle.tipoMembresiaId,
                    descripcion: detalle.descripcion,
                    articuloNombre:
                        detalle.producto?.nombre
                        ?? detalle.servicio?.nombre
                        ?? detalle.tipoMembresia?.nombre
                        ?? detalle.descripcion,
                    cantidad: detalle.cantidad,
                    cantidadDevuelta,
                    cantidadDisponible: detalle.cantidad - cantidadDevuelta,
                    precioUnitario: Number(detalle.precioUnitario),
                    descuentoUnitario: Number(detalle.descuentoUnitario ?? 0),
                    puedeDevolverse: !esMembresia && detalle.cantidad > cantidadDevuelta,
                    motivoBloqueo: esMembresia ? 'MEMBRESIA_NO_DEVOLVIBLE' : null,
                };
            }),
        };
    });
}

export async function previsualizarDevolucion(
    { ventaId, detallesSolicitados },
    client = prisma
) {
    const idVenta = validarIdVenta(ventaId);
    return client.$transaction(async (tx) => {
        const { venta, metodoPago } = await obtenerVentaElegible(tx, idVenta);
        const calculo = await calcularDevolucion(tx, idVenta, detallesSolicitados, venta.total);
        if (calculo.detalles.some((detalle) => detalle.tipoItem === 'MEMBRESIA')) {
            throw crearError(
                'Por el momento no se permiten devoluciones de membresías',
                409,
                'DEVOLUCION_NO_PERMITIDA'
            );
        }

        return {
            ventaId: idVenta,
            metodoPago,
            detalles: calculo.detalles,
            cantidadesDevueltasPrevisualizadas: calculo.cantidadesDevueltasPorDetalle,
            desglose: {
                subtotal: calculo.subtotalTotal,
                iva: calculo.ivaTotal,
                ajusteRedondeo: calculo.ajusteRedondeoTotal,
                montoTotal: calculo.montoTotal,
            },
        };
    });
}

export async function crearDevolucion(
    {
        ventaId,
        aperturaCajaId,
        motivo,
        detallesSolicitados,
        montoPrevisualizado,
        cantidadesDevueltasPrevisualizadas,
        folioCancelacion = null,
        confirmacionTerminal = false,
    },
    client = prisma
) {
    const idVenta = validarIdVenta(ventaId);
    const idApertura = Number(aperturaCajaId);
    if (!Number.isSafeInteger(idApertura) || idApertura <= 0) {
        throw crearError('ID de apertura de caja no válido');
    }
    if (typeof motivo !== 'string' || !motivo.trim() || motivo.trim().length > 500) {
        throw crearError('El motivo es obligatorio y no debe exceder 500 caracteres');
    }

    const preparada = await client.$transaction(async (tx) => {
        const aperturas = await tx.$queryRaw`
            SELECT id, estado, empleado_id AS empleadoId,
                   empresa_id AS empresaId, sucursal_id AS sucursalId
            FROM aperturas_caja
            WHERE id = ${idApertura} AND deleted_at IS NULL
            FOR UPDATE
        `;
        const apertura = aperturas[0];
        if (!apertura || apertura.estado !== 'ABIERTA') {
            throw crearError('La apertura de caja no existe o no está abierta', 409);
        }

        const ventasBloqueadas = await tx.$queryRaw`
            SELECT id
            FROM venta
            WHERE id = ${idVenta} AND deleted_at IS NULL
            FOR UPDATE
        `;
        if (ventasBloqueadas.length === 0) {
            throw crearError('La venta no existe', 404);
        }

        const { venta, metodoPago, transaccionPago } = await obtenerVentaElegible(tx, idVenta);

        const pendientes = await tx.devolucion.findMany({
            where: {
                ventaId: idVenta,
                aperturaCajaId: idApertura,
                estadoReembolso: 'PENDIENTE_REEMBOLSO',
                folioCancelacion: null,
            },
            include: {
                detalles: {
                    include: {
                        detalleVenta: {
                            select: { productoId: true },
                        },
                    },
                },
            },
            orderBy: { id: 'desc' },
        });
        const detallesSolicitadosOrdenados = [...(detallesSolicitados ?? [])]
            .map((detalle) => ({
                detalleVentaId: Number(detalle.detalleVentaId),
                cantidad: Number(detalle.cantidad),
                regresaAStock: Boolean(detalle.regresaAStock),
            }))
            .sort((a, b) => a.detalleVentaId - b.detalleVentaId);
        const reembolsoPendiente = pendientes.find((pendiente) => {
            const detallesPendientes = [...pendiente.detalles]
                .map((detalle) => ({
                    detalleVentaId: detalle.detalleVentaId,
                    cantidad: detalle.cantidad,
                    regresaAStock: detalle.regresaAStock,
                }))
                .sort((a, b) => a.detalleVentaId - b.detalleVentaId);
            return pendiente.motivo === motivo.trim()
                && aCentavos(pendiente.monto) === aCentavos(montoPrevisualizado)
                && JSON.stringify(detallesPendientes) === JSON.stringify(detallesSolicitadosOrdenados);
        });
        if (reembolsoPendiente) {
            const mensaje = metodoPago.codigo === 'MERCADO_PAGO'
                ? 'Este reembolso quedó pendiente de conciliación con Mercado Pago. Verifica si el cliente ya recibió el dinero antes de entregar efectivo.'
                : 'Existe un reembolso pendiente para esta venta.';
            throw crearError(mensaje, 409, 'REEMBOLSO_PENDIENTE_CONCILIACION');
        }

        const calculo = await calcularDevolucion(tx, idVenta, detallesSolicitados, venta.total);
        validarCotizacion(
            calculo,
            montoPrevisualizado,
            cantidadesDevueltasPrevisualizadas
        );
        if (calculo.detalles.some((detalle) => detalle.tipoItem === 'MEMBRESIA')) {
            throw crearError(
                'Por el momento no se permiten devoluciones de membresías',
                409,
                'DEVOLUCION_NO_PERMITIDA'
            );
        }
        const validacionPago = await validarReembolso(tx, {
            ventaId: idVenta,
            metodoPago,
            transaccionPago,
            monto: calculo.montoTotal,
            folioCancelacion,
            confirmacionTerminal,
        });
        const metodoPagoReembolso = validacionPago.metodoPagoReembolso ?? metodoPago;

        const devolucion = await tx.devolucion.create({
            data: {
                ventaId: idVenta,
                aperturaCajaId: idApertura,
                empleadoId: Number(apertura.empleadoId),
                metodoPagoId: metodoPagoReembolso.id,
                monto: calculo.montoTotal,
                motivo: motivo.trim(),
                estadoReembolso: 'PENDIENTE_REEMBOLSO',
                folioCancelacion: folioCancelacion?.trim() || null,
                detalles: {
                    create: calculo.detalles.map((detalle) => ({
                        detalleVentaId: detalle.detalleVentaId,
                        cantidad: detalle.cantidad,
                        monto: detalle.monto,
                        regresaAStock: detalle.regresaAStock,
                    })),
                },
            },
        });

        const detallesStock = calculo.detalles.map((detalle) => ({
            detalleVentaId: detalle.detalleVentaId,
            productoId: detalle.productoId,
            cantidad: detalle.cantidad,
            regresaAStock: detalle.regresaAStock,
        }));
        const contexto = {
            devolucion,
            metodoPago,
            metodoPagoReembolso,
            transaccionPago,
            monto: calculo.montoTotal,
            detallesStock,
            apertura,
        };

        const devolucionRegistrada = await completarReembolso(tx, {
            devolucionId: devolucion.id,
            ventaId: idVenta,
            apertura,
            metodoPago,
            metodoPagoReembolso,
            transaccionPago,
            monto: calculo.montoTotal,
            folioCancelacion,
            detallesStock,
        });
        return {
            ...contexto,
            devolucion: devolucionRegistrada,
            calculo,
        };
    });

    if (preparada.devolucion.estadoReembolso !== 'COMPLETADA') {
        throw crearError(
            'No se pudo completar el reembolso. Verifica el estado antes de intentar de nuevo.',
            503,
            'REEMBOLSO_PENDIENTE_CONCILIACION',
            { devolucionId: preparada.devolucion.id, estadoReembolso: preparada.devolucion.estadoReembolso }
        );
    }

    return preparada.calculo
        ? {
              ...preparada.devolucion,
              desglose: {
                  subtotal: preparada.calculo.subtotalTotal,
                  iva: preparada.calculo.ivaTotal,
                  ajusteRedondeo: preparada.calculo.ajusteRedondeoTotal,
                  montoTotal: preparada.calculo.montoTotal,
              },
          }
        : preparada.devolucion;
}

export async function calcularDevolucion(tx, ventaId, detallesSolicitados, totalVenta) {
    const idVenta = Number(ventaId);
    if (!Number.isSafeInteger(idVenta) || idVenta <= 0) {
        throw crearError('ID de venta no válido');
    }

    if (!Array.isArray(detallesSolicitados) || detallesSolicitados.length === 0) {
        throw crearError(
            'La devolución debe incluir al menos una línea',
            400,
            'DETALLES_DEVOLUCION_REQUERIDOS'
        );
    }

    const cantidadesSolicitadas = new Map();
    const regresarAStockSolicitado = new Map();
    for (const detalle of detallesSolicitados) {
        if (!detalle || typeof detalle !== 'object') {
            throw crearError('Las líneas de devolución no son válidas');
        }

        const detalleVentaId = Number(detalle.detalleVentaId);
        const cantidad = Number(detalle.cantidad);
        const regresaAStock = detalle.regresaAStock === undefined
            ? false
            : detalle.regresaAStock;

        if (!Number.isSafeInteger(detalleVentaId) || detalleVentaId <= 0) {
            throw crearError('ID de detalle de venta no válido');
        }
        if (!Number.isSafeInteger(cantidad) || cantidad <= 0) {
            throw crearError('La cantidad a devolver debe ser un entero mayor que cero');
        }
        if (typeof regresaAStock !== 'boolean') {
            throw crearError('regresaAStock debe ser un valor booleano');
        }
        if (cantidadesSolicitadas.has(detalleVentaId)) {
            throw crearError(`El detalle de venta ${detalleVentaId} está repetido`);
        }

        cantidadesSolicitadas.set(detalleVentaId, cantidad);
        regresarAStockSolicitado.set(detalleVentaId, regresaAStock);
    }

    const idsDetalle = [...cantidadesSolicitadas.keys()];
    const { detallesVenta, cantidadesDevueltas, montoDevueltoAnterior } =
        await obtenerEstadoDetallesVenta(tx, idVenta);

    const detallesVentaPorId = new Map(
        detallesVenta.map((detalleVenta) => [detalleVenta.id, detalleVenta])
    );
    if (idsDetalle.some((detalleVentaId) => !detallesVentaPorId.has(detalleVentaId))) {
        throw crearError('Una o más líneas no pertenecen a la venta indicada');
    }

    const detalles = idsDetalle.map((detalleVentaId) => {
        const detalleVenta = detallesVentaPorId.get(detalleVentaId);
        const cantidadSolicitada = cantidadesSolicitadas.get(detalleVenta.id);
        const regresaAStock = regresarAStockSolicitado.get(detalleVenta.id);
        const cantidadDevuelta = cantidadesDevueltas.get(detalleVenta.id) ?? 0;
        const cantidadDisponible = detalleVenta.cantidad - cantidadDevuelta;

        if (regresaAStock && detalleVenta.tipoItem !== 'PRODUCTO') {
            throw crearError('Solo los productos pueden regresar al inventario');
        }
        if (cantidadDisponible < 0) {
            throw crearError(
                `La cantidad ya devuelta excede la cantidad vendida en el detalle ${detalleVenta.id}`,
                409,
                'DEVOLUCIONES_INCONSISTENTES'
            );
        }
        if (cantidadSolicitada > cantidadDisponible) {
            throw crearError(
                `La cotización está desactualizada: quedan ${cantidadDisponible} unidades disponibles en el detalle ${detalleVenta.id}. Vuelve a cargar los datos.`,
                409,
                'COTIZACION_DESACTUALIZADA'
            );
        }

        const precioUnitario = Number(detalleVenta.precioUnitario);
        const descuentoUnitario = Number(detalleVenta.descuentoUnitario ?? 0);
        if (
            !Number.isFinite(precioUnitario)
            || !Number.isFinite(descuentoUnitario)
            || precioUnitario < 0
            || descuentoUnitario < 0
        ) {
            throw crearError(`Los importes del detalle ${detalleVenta.id} no son válidos`);
        }

        const importeUnitario = currency(precioUnitario).subtract(descuentoUnitario);
        if (importeUnitario.intValue < 0) {
            throw crearError(`El descuento excede el precio del detalle ${detalleVenta.id}`);
        }

        const subtotal = importeUnitario.multiply(cantidadSolicitada);
        const iva = subtotal.multiply(TASA_IVA);
        const monto = subtotal.add(iva);

        return {
            detalleVentaId: detalleVenta.id,
            productoId: detalleVenta.productoId,
            servicioId: detalleVenta.servicioId,
            tipoMembresiaId: detalleVenta.tipoMembresiaId,
            descripcion: detalleVenta.descripcion,
            tipoItem: detalleVenta.tipoItem,
            cantidad: cantidadSolicitada,
            cantidadDevuelta,
            cantidadDisponible,
            cantidadRestante: cantidadDisponible - cantidadSolicitada,
            precioUnitario: currency(precioUnitario).value,
            descuentoUnitario: currency(descuentoUnitario).value,
            precioNetoUnitario: importeUnitario.value,
            subtotal: subtotal.value,
            iva: iva.value,
            ajusteRedondeo: 0,
            monto: monto.value,
            regresaAStock,
        };
    });

    const cantidadTotalVenta = detallesVenta.reduce((total, detalle) => total + detalle.cantidad, 0);
    const cantidadDevueltaTrasSolicitud = detallesVenta.reduce(
        (total, detalle) => total
            + (cantidadesDevueltas.get(detalle.id) ?? 0)
            + (cantidadesSolicitadas.get(detalle.id) ?? 0),
        0
    );
    if (cantidadDevueltaTrasSolicitud === cantidadTotalVenta) {
        const ventaTotal = Number(totalVenta);
        if (!Number.isFinite(ventaTotal) || ventaTotal < 0) {
            throw crearError('El total de la venta no es válido', 409, 'VENTA_TOTAL_INVALIDO');
        }

        const montoRestanteVenta = currency(ventaTotal).subtract(montoDevueltoAnterior.value);
        const montoCalculado = detalles.reduce((total, detalle) => total.add(detalle.monto), currency(0));
        const ajusteFinal = montoRestanteVenta.subtract(montoCalculado.value);
        const detalleFinal = detalles[detalles.length - 1];
        const montoFinal = currency(detalleFinal.monto).add(ajusteFinal.value);
        if (montoFinal.intValue < 0) {
            throw crearError('El monto pendiente de devolución no es válido', 409, 'MONTO_DEVOLUCION_INVALIDO');
        }
        detalleFinal.monto = montoFinal.value;
        detalleFinal.ajusteRedondeo = ajusteFinal.value;
    }

    const montoTotal = detalles.reduce((total, detalle) => total.add(detalle.monto), currency(0));
    const subtotalTotal = detalles.reduce((total, detalle) => total.add(detalle.subtotal), currency(0));
    const ivaTotal = detalles.reduce((total, detalle) => total.add(detalle.iva), currency(0));
    const ajusteRedondeoTotal = detalles.reduce(
        (total, detalle) => total.add(detalle.ajusteRedondeo),
        currency(0)
    );

    return {
        detalles,
        subtotalTotal: subtotalTotal.value,
        ivaTotal: ivaTotal.value,
        ajusteRedondeoTotal: ajusteRedondeoTotal.value,
        montoTotal: montoTotal.value,
        cantidadesDevueltasPorDetalle: detallesVenta.map((detalle) => ({
            detalleVentaId: detalle.id,
            cantidadDevuelta: cantidadesDevueltas.get(detalle.id) ?? 0,
        })),
    };
}
