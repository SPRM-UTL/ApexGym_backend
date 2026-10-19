/**
 * Cálculos compartidos del control operativo de caja.
 *
 * Fórmula única del efectivo que debe haber físicamente en una caja:
 *
 *   efectivoEsperado = montoInicial + entradas - salidas + ventasEnEfectivo
 *
 * Solo las ventas COMPLETADAS cuyo método de pago es efectivo afectan el efectivo
 * físico. Las ventas con tarjeta/transferencia suman al total vendido pero no al cajón.
 * Las ventas CANCELADAS no se consideran en ningún total.
 */
import { prisma } from '../dao/BaseDao.js';

export const ESTADO_VENTA_COMPLETADA = 'COMPLETADA';
export const ESTADO_VENTA_CANCELADA = 'CANCELADA';

/** Redondea a 2 decimales evitando errores de punto flotante. */
export const redondear = (valor) => Math.round((Number(valor) + Number.EPSILON) * 100) / 100;

/** Indica si un método de pago representa dinero en efectivo (ignora acentos y mayúsculas). */
export const esMetodoEfectivo = (nombre) =>
    String(nombre ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .includes('efectivo');

/**
 * Bloquea la fila de la apertura (SELECT ... FOR UPDATE) dentro de una transacción.
 * Serializa ventas, cancelaciones y cortes de una misma caja: así una venta no puede
 * "colarse" mientras se calcula/cierra el corte. Devuelve el estado actual de la apertura.
 *
 * @param {object} tx - Cliente de transacción de Prisma.
 * @param {number} aperturaCajaId
 * @returns {Promise<string>} estado actual (ABIERTA | CERRADA)
 */
export async function bloquearApertura(tx, aperturaCajaId) {
    const filas = await tx.$queryRaw`
        SELECT estado FROM aperturas_caja
        WHERE id = ${Number(aperturaCajaId)} AND deleted_at IS NULL
        FOR UPDATE`;
    if (!filas.length) throw new Error('La apertura de caja especificada no existe');
    return filas[0].estado;
}

/**
 * Obtiene los totales de una apertura de caja: movimientos manuales y ventas reales.
 *
 * @param {number} aperturaCajaId
 * @param {object} [cliente=prisma] - Cliente Prisma o cliente de transacción (tx).
 */
export async function obtenerTotalesApertura(aperturaCajaId, cliente = prisma) {
    const id = Number(aperturaCajaId);

    // Consultas secuenciales: seguras tanto con el cliente global como dentro de una transacción.
    const sumaEntradas = await cliente.movimientoCaja.aggregate({
        where: { aperturaCajaId: id, tipo: 'ENTRADA', deletedAt: null },
        _sum: { monto: true },
    });
    const sumaSalidas = await cliente.movimientoCaja.aggregate({
        where: { aperturaCajaId: id, tipo: 'SALIDA', deletedAt: null },
        _sum: { monto: true },
    });
    const ventas = await cliente.venta.findMany({
        where: { aperturaCajaId: id, estado: ESTADO_VENTA_COMPLETADA, deletedAt: null },
        select: { total: true, metodoPago: { select: { id: true, nombre: true } } },
    });

    let totalVentas = 0;
    let totalVentasEfectivo = 0;
    const porMetodo = new Map();

    for (const venta of ventas) {
        const total = Number(venta.total);
        totalVentas += total;
        if (esMetodoEfectivo(venta.metodoPago?.nombre)) totalVentasEfectivo += total;

        const clave = venta.metodoPago?.id ?? 0;
        const actual = porMetodo.get(clave) ?? {
            metodoPagoId: venta.metodoPago?.id ?? null,
            nombre: venta.metodoPago?.nombre ?? 'Sin método',
            esEfectivo: esMetodoEfectivo(venta.metodoPago?.nombre),
            transacciones: 0,
            total: 0,
        };
        actual.transacciones += 1;
        actual.total += total;
        porMetodo.set(clave, actual);
    }

    const transacciones = ventas.length;
    totalVentas = redondear(totalVentas);

    return {
        totalEntradas: redondear(sumaEntradas._sum.monto ?? 0),
        totalSalidas: redondear(sumaSalidas._sum.monto ?? 0),
        totalVentas,
        totalVentasEfectivo: redondear(totalVentasEfectivo),
        transaccionesVentas: transacciones,
        ticketPromedio: transacciones > 0 ? redondear(totalVentas / transacciones) : 0,
        ventasPorMetodoPago: [...porMetodo.values()]
            .map((m) => ({ ...m, total: redondear(m.total) }))
            .sort((a, b) => b.total - a.total),
    };
}

/**
 * Efectivo que debe haber en caja según el sistema.
 * @param {number} montoInicial
 * @param {{ totalEntradas: number, totalSalidas: number, totalVentasEfectivo: number }} totales
 */
export const calcularEfectivoEsperado = (montoInicial, totales) =>
    redondear(
        Number(montoInicial) +
            Number(totales.totalEntradas) -
            Number(totales.totalSalidas) +
            Number(totales.totalVentasEfectivo)
    );
