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
            const { aperturaCajaId, empleadoId, efectivoContado, observaciones, desgloseInicio, desgloseFin } = req.body;

            this.validarCampos({ aperturaCajaId, empleadoId, efectivoContado, observaciones });

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
                        estado: 'PENDIENTE',
                        desgloseInicio: typeof desgloseInicio === 'object' ? JSON.stringify(desgloseInicio) : (desgloseInicio || apertura.desgloseInicio || null),
                        desgloseFin: typeof desgloseFin === 'object' ? JSON.stringify(desgloseFin) : (desgloseFin || null),
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

    actualizar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) throw new Error('ID no válido');

            const { observaciones, desgloseFin, efectivoContado } = req.body;
            if (observaciones && observaciones.trim().length > 500) {
                throw new Error('Las observaciones no pueden exceder 500 caracteres');
            }

            const data = {};
            if (observaciones !== undefined) data.observaciones = observaciones ? observaciones.trim() : null;
            if (desgloseFin !== undefined) data.desgloseFin = typeof desgloseFin === 'object' ? JSON.stringify(desgloseFin) : (desgloseFin || null);
            if (efectivoContado !== undefined) {
                if (isNaN(Number(efectivoContado)) || Number(efectivoContado) < 0 || Number(efectivoContado) > 99999999.99) {
                    throw new Error('El monto de efectivo contado no es válido');
                }
                data.efectivoContado = Number(efectivoContado);
            }

            const registro = await this.dao.update(id, data);
            return this.respuestaExito(res, registro, 'Corte de caja actualizado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    eliminar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) throw new Error('ID no válido');
            const registro = await this.dao.delete(id);
            return this.respuestaExito(res, registro, 'Corte de caja eliminado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    validar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) throw new Error('ID de corte no válido');

            const corte = await this.dao.getById(id);
            if (!corte) return this.respuestaNoEncontrado(res, 'Corte de caja no encontrado');

            const registro = await this.dao.update(id, {
                estado: 'VALIDADO',
                fechaValidacion: new Date(),
            });

            return this.respuestaExito(res, registro, 'Corte de caja validado exitosamente');
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

    validarCampos({ aperturaCajaId, empleadoId, efectivoContado, observaciones }) {
        if (!aperturaCajaId || isNaN(Number(aperturaCajaId)))
            throw new Error('La apertura de caja es requerida');
        if (!empleadoId || isNaN(Number(empleadoId))) throw new Error('El empleado es requerido');
        if (efectivoContado === undefined || efectivoContado === null || isNaN(Number(efectivoContado)))
            throw new Error('El efectivo contado es requerido');
        if (Number(efectivoContado) < 0)
            throw new Error('El efectivo contado debe ser mayor o igual a 0');
        if (Number(efectivoContado) > 99999999.99)
            throw new Error('El efectivo contado no puede exceder $99,999,999.99');
        if (observaciones && observaciones.trim().length > 500)
            throw new Error('Las observaciones no pueden exceder 500 caracteres');
    }
}

export const corteCajaController = new CorteCajaController();
