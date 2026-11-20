import currency from 'currency.js';
import { prisma as defaultPrisma } from '../dao/BaseDao.js';

export function calcularEfectivoEsperado({
    montoInicial,
    totalEntradas,
    totalSalidas,
}) {
    return currency(Number(montoInicial ?? 0))
        .add(Number(totalEntradas ?? 0))
        .subtract(Number(totalSalidas ?? 0))
        .value;
}

/**
 * Consulta y calcula los totales de entradas y salidas de una apertura de caja.
 * @param {object} params
 * @param {number} params.aperturaCajaId - ID de la apertura de caja
 * @param {boolean} [params.soloEfectivo=false] - Si es true, filtra únicamente movimientos con afectaEfectivo = true
 * @param {object} [params.client] - Cliente Prisma (prisma o tx de transacción)
 * @returns {Promise<{ totalEntradas: number, totalSalidas: number, balance: number }>}
 */
export async function obtenerTotalesMovimientos({
    aperturaCajaId,
    soloEfectivo = false,
    client = defaultPrisma,
}) {
    const idApertura = Number(aperturaCajaId);
    if (!Number.isSafeInteger(idApertura) || idApertura <= 0) {
        throw new Error('ID de apertura no válido para consultar totales de movimientos.');
    }

    const whereBase = {
        aperturaCajaId: idApertura,
        deletedAt: null,
        ...(soloEfectivo ? { afectaEfectivo: true } : {}),
    };

    const [sumaEntradas, sumaSalidas] = await Promise.all([
        client.movimientoCaja.aggregate({
            where: { ...whereBase, tipo: 'ENTRADA' },
            _sum: { monto: true },
        }),
        client.movimientoCaja.aggregate({
            where: { ...whereBase, tipo: 'SALIDA' },
            _sum: { monto: true },
        }),
    ]);

    const totalEntradas = currency(String(sumaEntradas._sum?.monto ?? 0)).value;
    const totalSalidas = currency(String(sumaSalidas._sum?.monto ?? 0)).value;
    const balance = currency(totalEntradas).subtract(totalSalidas).value;

    return {
        totalEntradas,
        totalSalidas,
        balance,
    };
}
