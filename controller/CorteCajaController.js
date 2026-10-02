import { corteCajaDao } from '../dao/CorteCajaDao.js';
import { BaseController } from './BaseController.js';
import { prisma } from '../dao/BaseDao.js';

export class CorteCajaController extends BaseController {
    constructor() {
        super(corteCajaDao);
    }

    /**
     * POST /
     * Crea el corte de caja calculando totales de movimientos automáticamente
     * y cambia el estado de la apertura a CERRADA.
     */
    crear = async (req, res) => {
        try {
            const { aperturaCajaId, empleadoId, efectivoContado, observaciones } = req.body;

            this.validar({ aperturaCajaId, empleadoId, efectivoContado });

            // Obtener la apertura con su monto inicial
            const apertura = await prisma.aperturaCaja.findUnique({
                where: { id: Number(aperturaCajaId), deletedAt: null },
            });
            if (!apertura) throw new Error('La apertura de caja especificada no existe');
            if (apertura.estado !== 'ABIERTA')
                throw new Error('La apertura de caja ya está cerrada, no se puede generar otro corte');

            // Sumar movimientos ENTRADA y SALIDA de esta apertura
            const [sumaEntradas, sumaSalidas] = await Promise.all([
                prisma.movimientoCaja.aggregate({
                    where: { aperturaCajaId: Number(aperturaCajaId), tipo: 'ENTRADA', deletedAt: null },
                    _sum: { monto: true },
                }),
                prisma.movimientoCaja.aggregate({
                    where: { aperturaCajaId: Number(aperturaCajaId), tipo: 'SALIDA', deletedAt: null },
                    _sum: { monto: true },
                }),
            ]);

            const totalEntradas = Number(sumaEntradas._sum.monto ?? 0);
            const totalSalidas = Number(sumaSalidas._sum.monto ?? 0);
            const montoInicial = Number(apertura.montoInicial);
            const efectivoEsperado = montoInicial + totalEntradas - totalSalidas;
            const diferencia = Number(efectivoContado) - efectivoEsperado;

            // Crear el corte y cerrar la apertura en una transacción
            const resultado = await prisma.$transaction(async (tx) => {
                const corte = await tx.corteCaja.create({
                    data: {
                        aperturaCajaId: Number(aperturaCajaId),
                        empleadoId: Number(empleadoId),
                        efectivoContado: Number(efectivoContado),
                        totalEntradas,
                        totalSalidas,
                        diferencia,
                        observaciones: observaciones ? observaciones.trim() : null,
                        fechaCorte: new Date(),
                    },
                    omit: {
                        createdAt: true,
                        updatedAt: true,
                        deletedAt: true,
                    },
                });

                // Cerrar la apertura
                await tx.aperturaCaja.update({
                    where: { id: Number(aperturaCajaId) },
                    data: { estado: 'CERRADA' },
                });

                return corte;
            });

            return this.respuestaExito(res, resultado, 'Corte de caja registrado y apertura cerrada correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    obtenerPorApertura = async (req, res) => {
        try {
            const aperturaCajaId = Number(req.params.aperturaCajaId);
            if (isNaN(aperturaCajaId)) throw new Error('ID de apertura no válido');
            const registros = await this.dao.getByApertura(aperturaCajaId);
            return this.respuestaExito(res, registros, 'Cortes obtenidos exitosamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    validar({ aperturaCajaId, empleadoId, efectivoContado }) {
        if (!aperturaCajaId || isNaN(Number(aperturaCajaId)))
            throw new Error('La apertura de caja es requerida');
        if (!empleadoId || isNaN(Number(empleadoId))) throw new Error('El empleado es requerido');
        if (efectivoContado === undefined || efectivoContado === null || isNaN(Number(efectivoContado)))
            throw new Error('El efectivo contado es requerido');
        if (Number(efectivoContado) < 0)
            throw new Error('El efectivo contado debe ser mayor o igual a 0');
    }
}

export const corteCajaController = new CorteCajaController();
