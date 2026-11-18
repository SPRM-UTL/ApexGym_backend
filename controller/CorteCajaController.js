import { corteCajaDao } from '../dao/CorteCajaDao.js';
import { BaseController } from './BaseController.js';
import { prisma } from '../dao/BaseDao.js';
import currency from 'currency.js';
import { ventaDao } from '../dao/VentaDao.js';
import { calcularEfectivoEsperado, obtenerTotalesMovimientos } from '../utils/calcularEfectivoCaja.js';

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

            // Verificar que no existan movimientos pendientes de validar
            const movimientosPendientes = await prisma.movimientoCaja.count({
                where: {
                    aperturaCajaId: Number(aperturaCajaId),
                    estado: { not: 'VALIDADO' },
                    deletedAt: null,
                },
            });
            if (movimientosPendientes > 0) {
                throw new Error(`No se puede realizar el corte de caja: existen ${movimientosPendientes} movimiento(s) pendientes de validar en este turno. Valide todos los movimientos antes de cerrar la caja.`);
            }

            // Crear el corte y cerrar la apertura en una transacción
            const resultado = await prisma.$transaction(async (tx) => {
                // 1. Bloquear la fila de la apertura para serializar con ventas y otros cortes
                const aperturas = await tx.$queryRaw`
                    SELECT id, estado, monto_inicial AS montoInicial,
                           desglose_inicio AS desgloseInicio,
                           empleado_id AS empleadoId
                    FROM aperturas_caja
                    WHERE id = ${Number(aperturaCajaId)} AND deleted_at IS NULL
                    FOR UPDATE
                `;
                const apertura = aperturas[0];
                if (!apertura) throw new Error('La apertura de caja especificada no existe');
                if (apertura.estado !== 'ABIERTA') {
                    throw new Error('La apertura de caja ya está cerrada, no se puede generar otro corte');
                }

                await ventaDao.expirarPagosPendientesEnApertura(
                    tx,
                    Number(aperturaCajaId),
                    new Date()
                );
                const ventasPagoPendientes = await tx.venta.count({
                    where: {
                        aperturaCajaId: Number(aperturaCajaId),
                        estado: 'pendiente_pago',
                        deletedAt: null,
                    },
                });
                if (ventasPagoPendientes > 0) {
                    const error = new Error(`No se puede realizar el corte: hay ${ventasPagoPendientes} venta(s) con pago digital pendiente.`);
                    error.status = 409;
                    throw error;
                }

                // 2. Verificar que no existan movimientos pendientes de validar
                const movimientosPendientes = await tx.movimientoCaja.count({
                    where: {
                        aperturaCajaId: Number(aperturaCajaId),
                        estado: { not: 'VALIDADO' },
                        deletedAt: null,
                    },
                });
                if (movimientosPendientes > 0) {
                    throw new Error(`No se puede realizar el corte de caja: existen ${movimientosPendientes} movimiento(s) pendientes de validar en este turno. Valide todos los movimientos antes de cerrar la caja.`);
                }

                // 3. Sumar movimientos, ventas y devoluciones de esta apertura
                const [
                    totalesGenerales,
                    totalesEfectivo,
                    resumenVentas,
                    sumaDevoluciones,
                ] = await Promise.all([
                    obtenerTotalesMovimientos({ aperturaCajaId: Number(aperturaCajaId), client: tx }),
                    obtenerTotalesMovimientos({ aperturaCajaId: Number(aperturaCajaId), soloEfectivo: true, client: tx }),
                    ventaDao.obtenerResumenVentasPorApertura(Number(aperturaCajaId), tx),
                    tx.devolucion.aggregate({
                        where: { aperturaCajaId: Number(aperturaCajaId) },
                        _sum: { monto: true },
                    }),
                ]);

                const totalEntradas = totalesGenerales.totalEntradas;
                const totalSalidas = totalesGenerales.totalSalidas;
                const totalDevoluciones = currency(String(sumaDevoluciones._sum.monto ?? 0)).value;
                const montoInicial = currency(String(apertura.montoInicial ?? 0)).value;

                const efectivoEsperado = calcularEfectivoEsperado({
                    montoInicial,
                    totalEntradas: totalesEfectivo.totalEntradas,
                    totalSalidas: totalesEfectivo.totalSalidas,
                });

                const diferencia = currency(Number(efectivoContado)).subtract(efectivoEsperado).value;

                // Validar justificación obligatoria si existe faltante o sobrante
                if (Math.abs(diferencia) > 0.01 && (!observaciones || !observaciones.trim())) {
                    const tipoDiff = diferencia < 0 ? 'faltante' : 'sobrante';
                    const montoDiff = Math.abs(diferencia).toFixed(2);
                    const contadoStr = Number(efectivoContado).toFixed(2);
                    const esperadoStr = efectivoEsperado.toFixed(2);
                    throw new Error(
                        `Existe una diferencia de ${tipoDiff} ($${montoDiff}) entre el efectivo contado ($${contadoStr}) y el saldo teórico esperado ($${esperadoStr}). Debe ingresar obligatoriamente la justificación en las observaciones.`
                    );
                }

                // 4. Guardar el corte con los tres totales
                const corte = await tx.corteCaja.create({
                    data: {
                        aperturaCajaId: Number(aperturaCajaId),
                        empleadoId: Number(empleadoId),
                        efectivoContado: Number(efectivoContado),
                        totalEntradas,
                        totalSalidas,
                        totalEntradasEfectivo: totalesEfectivo.totalEntradas,
                        totalSalidasEfectivo: totalesEfectivo.totalSalidas,
                        totalVentas: resumenVentas.totalVentas,
                        totalVentasEfectivo: resumenVentas.totalVentasEfectivo,
                        totalVentasCanceladas: resumenVentas.totalVentasCanceladas,
                        totalDevoluciones,
                        efectivoEsperado,
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

                // 5. Cerrar la apertura
                await tx.aperturaCaja.update({
                    where: { id: Number(aperturaCajaId) },
                    data: { estado: 'CERRADA' },
                });

                return {
                    ...corte,
                    ventasPorMetodoPago: resumenVentas.ventasPorMetodoPago,
                    totalesVentas: resumenVentas,
                };
            });

            return this.respuestaExito(res, resultado, 'Corte de caja registrado y apertura cerrada correctamente');
        } catch (error) {
            if (error.status === 409) {
                return res.status(409).json({
                    data: null,
                    responseFlag: 1,
                    message: error.message,
                    statusCode: 409,
                });
            }
            return this.respuestaError(res, error);
        }
    };

    obtenerPorId = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) throw new Error('ID de corte no válido');

            const corte = await this.dao.getById(id);
            if (!corte) return this.respuestaNoEncontrado(res, 'Corte de caja no encontrado');

            let resumenVentas = null;
            let totalesGenerales = null;
            if (corte.aperturaCajaId) {
                try {
                    [resumenVentas, totalesGenerales] = await Promise.all([
                        ventaDao.obtenerResumenVentasPorApertura(corte.aperturaCajaId),
                        obtenerTotalesMovimientos({ aperturaCajaId: corte.aperturaCajaId }),
                    ]);
                } catch {
                    resumenVentas = null;
                }
            }

            return this.respuestaExito(res, {
                ...corte,
                totalEntradasEfectivo: Number(corte.totalEntradasEfectivo ?? corte.totalVentasEfectivo ?? 0),
                totalSalidasEfectivo: Number(corte.totalSalidasEfectivo ?? 0),
                totalEntradasGenerales: totalesGenerales ? totalesGenerales.totalEntradas : Number(corte.totalEntradas ?? 0),
                totalSalidasGenerales: totalesGenerales ? totalesGenerales.totalSalidas : Number(corte.totalSalidas ?? 0),
                ventasPorMetodoPago: resumenVentas?.ventasPorMetodoPago ?? [],
                totalesVentas: resumenVentas ?? null,
            }, 'Corte obtenido exitosamente');
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
