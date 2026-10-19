import { corteCajaDao } from '../dao/CorteCajaDao.js';
import { BaseController } from './BaseController.js';
import { prisma } from '../dao/BaseDao.js';
import {
    bloquearApertura,
    calcularEfectivoEsperado,
    obtenerTotalesApertura,
    redondear,
} from '../utilidades/calculosCaja.js';

export class CorteCajaController extends BaseController {
    constructor() {
        super(corteCajaDao);
    }

    /**
     * POST /
     * Crea el corte de caja calculando automáticamente los totales de movimientos
     * y de ventas reales (solo las ventas en efectivo afectan el efectivo esperado)
     * y cambia el estado de la apertura a CERRADA.
     *
     * efectivoEsperado = montoInicial + entradas - salidas + ventasEnEfectivo
     */
    crear = async (req, res) => {
        try {
            const { aperturaCajaId, empleadoId, efectivoContado, observaciones, desgloseInicio, desgloseFin } = req.body;

            this.validarCampos({ aperturaCajaId, empleadoId, efectivoContado, observaciones });

            const mensajePendientes = (n) =>
                `No se puede realizar el corte de caja: existen ${n} movimiento(s) pendientes de validar en este turno. Valide todos los movimientos antes de cerrar la caja.`;

            // Crear el corte y cerrar la apertura en una transacción.
            // La apertura se bloquea para que ninguna venta/cancelación cambie los totales mientras se calcula.
            const resultado = await prisma.$transaction(async (tx) => {
                const estadoApertura = await bloquearApertura(tx, aperturaCajaId);
                if (estadoApertura !== 'ABIERTA')
                    throw new Error('La apertura de caja ya está cerrada, no se puede generar otro corte');

                const apertura = await tx.aperturaCaja.findUnique({
                    where: { id: Number(aperturaCajaId), deletedAt: null },
                });
                if (!apertura) throw new Error('La apertura de caja especificada no existe');

                // Verificar que no existan movimientos pendientes de validar
                const movimientosPendientes = await tx.movimientoCaja.count({
                    where: {
                        aperturaCajaId: Number(aperturaCajaId),
                        estado: { not: 'VALIDADO' },
                        deletedAt: null,
                    },
                });
                if (movimientosPendientes > 0) throw new Error(mensajePendientes(movimientosPendientes));

                // Movimientos manuales + ventas reales de esta apertura
                const totales = await obtenerTotalesApertura(aperturaCajaId, tx);
                const efectivoEsperado = calcularEfectivoEsperado(apertura.montoInicial, totales);
                const diferencia = redondear(Number(efectivoContado) - efectivoEsperado);

                const corte = await tx.corteCaja.create({
                    data: {
                        aperturaCajaId: Number(aperturaCajaId),
                        empleadoId: Number(empleadoId),
                        efectivoContado: Number(efectivoContado),
                        totalEntradas: totales.totalEntradas,
                        totalSalidas: totales.totalSalidas,
                        totalVentas: totales.totalVentas,
                        totalVentasEfectivo: totales.totalVentasEfectivo,
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
        return this.respuestaError(res, new Error('Los cortes de caja no pueden ser modificados por políticas de control y auditoría contable'));
    };

    eliminar = async (req, res) => {
        return this.respuestaError(res, new Error('Los cortes de caja no pueden ser eliminados por políticas de control y auditoría contable'));
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
