import currency from 'currency.js';
import { prisma } from './BaseDao.js';
import { TASA_IVA } from '../utilidades/constantes.js';


function crearError(mensaje, status = 400, code) {
    const error = new Error(mensaje);
    error.status = status;
    if (code) {
        error.code = code;
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
            metodoPagoLegacy: true,
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
    } else {
        const metodoLegacy = String(venta.metodoPagoLegacy ?? '').trim();
        const codigoLegacy = metodoLegacy.toUpperCase();
        if (metodoLegacy) {
            metodoPago = await tx.metodoPago.findFirst({
                where: {
                    OR: [
                        { codigo: codigoLegacy },
                        { nombre: metodoLegacy },
                    ],
                },
                select: { id: true, codigo: true, nombre: true },
            });
        }
    }
    if (!metodoPago) {
        throw crearError('No se pudo identificar el método de pago original de la venta');
    }

    return { venta, metodoPago };
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
            where: { detalleVentaId: { in: idsDetalle } },
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

    return client.$transaction(async (tx) => {
        const aperturas = await tx.$queryRaw`
            SELECT id, estado, empleado_id AS empleadoId
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

        const { venta, metodoPago } = await obtenerVentaElegible(tx, idVenta);

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

        const devolucion = await tx.devolucion.create({
            data: {
                ventaId: idVenta,
                aperturaCajaId: idApertura,
                empleadoId: Number(apertura.empleadoId),
                metodoPagoId: metodoPago.id,
                monto: calculo.montoTotal,
                motivo: motivo.trim(),
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

        for (const detalle of calculo.detalles) {
            if (!detalle.regresaAStock) {
                continue;
            }
            if (!Number.isSafeInteger(detalle.productoId) || detalle.productoId <= 0) {
                throw crearError('La línea marcada para regresar al inventario no tiene un producto válido');
            }

            const productoActualizado = await tx.producto.updateMany({
                where: {
                    id: detalle.productoId,
                    deletedAt: null,
                },
                data: {
                    stockActual: { increment: detalle.cantidad },
                },
            });
            if (productoActualizado.count !== 1) {
                throw crearError(`No se pudo regresar al inventario el producto ${detalle.productoId}`, 409);
            }
        }

        const esPagoEfectivo = String(metodoPago.codigo ?? '').trim().toUpperCase() === 'EFECTIVO'
            || (venta.metodoPagoId === null
                && String(venta.metodoPagoLegacy ?? '').trim().toLowerCase() === 'efectivo');
        if (esPagoEfectivo) {
            await tx.movimientoCaja.create({
                data: {
                    aperturaCajaId: idApertura,
                    empleadoId: Number(apertura.empleadoId),
                    tipo: 'SALIDA',
                    monto: calculo.montoTotal,
                    concepto: `Devolución de venta folio ${venta.folioVentaId}`,
                    estado: 'PENDIENTE',
                    devolucionId: devolucion.id,
                },
            }, { isolationLevel: 'ReadCommitted' });
        }

        const devolucionRegistrada = await tx.devolucion.findUnique({
            where: { id: devolucion.id },
            include: {
                detalles: true,
                movimientoCaja: true,
                metodoPago: { select: { id: true, nombre: true, codigo: true } },
            },
        });
        const calculosPorDetalle = new Map(
            calculo.detalles.map((detalle) => [detalle.detalleVentaId, detalle])
        );

        return {
            ...devolucionRegistrada,
            detalles: devolucionRegistrada.detalles.map((detalle) => {
                const desglose = calculosPorDetalle.get(detalle.detalleVentaId);
                return {
                    ...detalle,
                    descripcion: desglose.descripcion,
                    tipoItem: desglose.tipoItem,
                    productoId: desglose.productoId,
                    servicioId: desglose.servicioId,
                    tipoMembresiaId: desglose.tipoMembresiaId,
                    precioUnitario: desglose.precioUnitario,
                    descuentoUnitario: desglose.descuentoUnitario,
                    precioNetoUnitario: desglose.precioNetoUnitario,
                    subtotal: desglose.subtotal,
                    iva: desglose.iva,
                    ajusteRedondeo: desglose.ajusteRedondeo,
                };
            }),
            desglose: {
                subtotal: calculo.subtotalTotal,
                iva: calculo.ivaTotal,
                ajusteRedondeo: calculo.ajusteRedondeoTotal,
                montoTotal: calculo.montoTotal,
            },
        };
    });
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
