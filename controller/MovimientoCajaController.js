/**
 * Issue: [CAJA-02] Backend: Ciclo de vida y endpoint de validacion de movimientos de caja #87
 * Parent: Control Operativo de Caja, Auditoria Contable y Reporte de Corte en PDF #85
 *
 * Tareas:
 * - Asignar estado PENDIENTE por defecto al registrar entradas o salidas de efectivo.
 * - Endpoint POST/PUT /api/movimientos-caja/:id/validar para marcar movimientos como VALIDADO.
 * - Bloquear actualizacion y eliminacion de movimientos que ya se encuentren en estado VALIDADO.
 * - Bloquear validacion de movimientos si la caja de la apertura no se encuentra en estado ABIERTA.
 * - Calcular movimientosValidados y movimientosPendientes en el resumen de apertura.
 */
import { movimientoCajaDao } from '../dao/MovimientoCajaDao.js';
import { BaseController } from './BaseController.js';
import { prisma } from '../dao/BaseDao.js';
import currency from 'currency.js';
import { ventaDao } from '../dao/VentaDao.js';

const TIPOS_VALIDOS = ['ENTRADA', 'SALIDA'];


function procesarDesgloseYObservaciones(observaciones, desglose) {
    let obsClean = observaciones !== undefined && observaciones !== null ? String(observaciones).trim() : null;
    let desgloseFinal = desglose;

    if (obsClean && obsClean.includes('Desglose: {')) {
        const parts = obsClean.split(/\|\s*Desglose:\s*|Desglose:\s*/i);
        if (parts[1]) {
            const match = parts[1].match(/^\{.*?\}/);
            if (match && !desgloseFinal) {
                try {
                    desgloseFinal = JSON.parse(match[0]);
                } catch (e) {
                    desgloseFinal = match[0];
                }
            }
        }
        obsClean = (parts[0]?.trim()) || null;
    }

    const desgloseStr = desgloseFinal
        ? (typeof desgloseFinal === 'object' ? JSON.stringify(desgloseFinal) : String(desgloseFinal))
        : null;

    return {
        observaciones: obsClean || null,
        desglose: desgloseStr,
    };
}

export class MovimientoCajaController extends BaseController {
    constructor() {
        super(movimientoCajaDao);
    }

    crear = async (req, res) => {
        try {
            const { aperturaCajaId, empleadoId, tipo, monto, concepto, observaciones, desglose } = req.body;
            const { observaciones: obsLimpia, desglose: desgloseStr } = procesarDesgloseYObservaciones(observaciones, desglose);

            this.validarCampos({ aperturaCajaId, empleadoId, tipo, monto, concepto, observaciones: obsLimpia });

            const idApertura = Number(aperturaCajaId);
            const tipoNormalizado = tipo.trim().toUpperCase();
            const registro = await prisma.$transaction(async (tx) => {
                const aperturas = await tx.$queryRaw`
                    SELECT id, estado, monto_inicial AS montoInicial
                    FROM aperturas_caja
                    WHERE id = ${idApertura} AND deleted_at IS NULL
                    FOR UPDATE
                `;
                const apertura = aperturas[0];
                if (!apertura) throw new Error('La apertura de caja especificada no existe');
                if (apertura.estado !== 'ABIERTA')
                    throw new Error('No se pueden registrar movimientos en una apertura cerrada');

                if (tipoNormalizado === 'SALIDA') {
                    const [sumaEntradas, sumaSalidas, resumenVentas] = await Promise.all([
                        tx.movimientoCaja.aggregate({
                            where: { aperturaCajaId: idApertura, tipo: 'ENTRADA', deletedAt: null },
                            _sum: { monto: true },
                        }),
                        tx.movimientoCaja.aggregate({
                            where: { aperturaCajaId: idApertura, tipo: 'SALIDA', deletedAt: null },
                            _sum: { monto: true },
                        }),
                        ventaDao.obtenerResumenVentasPorApertura(idApertura, tx),
                    ]);

                    const totalEntradas = currency(String(sumaEntradas._sum.monto ?? 0)).value;
                    const totalSalidas = currency(String(sumaSalidas._sum.monto ?? 0)).value;
                    const saldoDisponible = currency(String(apertura.montoInicial ?? 0))
                        .add(totalEntradas)
                        .subtract(totalSalidas)
                        .add(resumenVentas.totalVentasEfectivoBruto)
                        .value;

                    if (Number(monto) > saldoDisponible) {
                        throw new Error(`Saldo insuficiente en caja. El saldo disponible es de ${saldoDisponible.toFixed(2)} y se intentó retirar ${Number(monto).toFixed(2)}`);
                    }
                }

                return tx.movimientoCaja.create({
                    data: {
                        aperturaCajaId: idApertura,
                        empleadoId: Number(empleadoId),
                        tipo: tipoNormalizado,
                        monto: Number(monto),
                        concepto: concepto.trim(),
                        estado: 'PENDIENTE',
                        desglose: desgloseStr,
                        observaciones: obsLimpia,
                    },
                });
            });

            return this.respuestaExito(res, registro, 'Movimiento de caja registrado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    actualizar = async (req, res) => {
        try {
            throw new Error('Los movimientos de caja no se pueden editar. Son registros contables inmutables de auditoría.');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    eliminar = async (req, res) => {
        try {
            throw new Error('Los movimientos de caja no se pueden eliminar. Son registros contables inmutables de auditoría.');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    validar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) throw new Error('ID no válido');

            const movimientoExistente = await prisma.movimientoCaja.findUnique({
                where: { id, deletedAt: null },
                include: { aperturaCaja: true },
            });
            if (!movimientoExistente) throw new Error('Movimiento de caja no encontrado');

            if (movimientoExistente.aperturaCaja?.estado !== 'ABIERTA') {
                throw new Error('No se puede validar este movimiento porque la caja ya no está abierta');
            }

            const registro = await prisma.movimientoCaja.update({
                where: { id },
                data: { estado: 'VALIDADO' },
            });

            return this.respuestaExito(res, registro, 'Movimiento de caja validado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    obtenerPorApertura = async (req, res) => {
        try {
            const aperturaCajaId = Number(req.params.aperturaCajaId);
            if (isNaN(aperturaCajaId)) throw new Error('ID de apertura no válido');
            const registros = await this.dao.getAllByApertura(aperturaCajaId);
            return this.respuestaExito(res, registros, 'Movimientos obtenidos exitosamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    obtenerResumenApertura = async (req, res) => {
        try {
            const aperturaCajaId = Number(req.params.aperturaCajaId);
            if (isNaN(aperturaCajaId)) throw new Error('ID de apertura no válido');

            const apertura = await prisma.aperturaCaja.findUnique({
                where: { id: aperturaCajaId, deletedAt: null },
                include: { caja: true, empleado: true },
            });
            if (!apertura) throw new Error('Apertura no encontrada');

            const [sumaEntradas, sumaSalidas, movimientos, resumenVentas] = await Promise.all([
                prisma.movimientoCaja.aggregate({
                    where: { aperturaCajaId, tipo: 'ENTRADA', deletedAt: null },
                    _sum: { monto: true },
                }),
                prisma.movimientoCaja.aggregate({
                    where: { aperturaCajaId, tipo: 'SALIDA', deletedAt: null },
                    _sum: { monto: true },
                }),
                this.dao.getAllByApertura(aperturaCajaId),
                ventaDao.obtenerResumenVentasPorApertura(aperturaCajaId),
            ]);

            const totalEntradas = currency(String(sumaEntradas._sum.monto ?? 0)).value;
            const totalSalidas = currency(String(sumaSalidas._sum.monto ?? 0)).value;
            const montoInicial = currency(String(apertura.montoInicial ?? 0)).value;
            const saldoDisponible = currency(montoInicial)
                .add(totalEntradas)
                .subtract(totalSalidas)
                .add(resumenVentas.totalVentasEfectivoBruto)
                .value;
            const movimientosPendientes = movimientos.filter((m) => m.estado !== 'VALIDADO').length;
            const movimientosValidados = movimientos.filter((m) => m.estado === 'VALIDADO').length;

            // Transacciones financieras del turno (Efectivo, Terminal con voucher y Mercado Pago)
            const corteAsociado = await prisma.corteCaja.findFirst({
                where: { aperturaCajaId, deletedAt: null },
                orderBy: { id: 'desc' },
            });

            const filtroFecha = {
                gte: apertura.fechaApertura,
                ...(corteAsociado?.fechaCorte ? { lte: corteAsociado.fechaCorte } : {}),
            };

            const transaccionesTurno = await prisma.transaccionPago.findMany({
                where: {
                    empresaId: apertura.empresaId,
                    estado: 'APROBADO',
                    createdAt: filtroFecha,
                    deletedAt: null,
                },
                orderBy: { id: 'desc' },
            });

            let totalVentasEfectivo = 0;
            let opsEfectivo = 0;
            let totalVentasTerminal = 0;
            let opsTerminal = 0;
            let totalVentasDigital = 0;
            let opsDigital = 0;

            for (const t of transaccionesTurno) {
                const monto = Number(t.monto);
                if (t.proveedor === 'EFECTIVO') {
                    totalVentasEfectivo += monto;
                    opsEfectivo++;
                } else if (t.proveedor === 'TERMINAL_MANUAL') {
                    totalVentasTerminal += monto;
                    opsTerminal++;
                } else {
                    totalVentasDigital += monto;
                    opsDigital++;
                }
            }

            const totalVentas = totalVentasEfectivo + totalVentasTerminal + totalVentasDigital;
            const transaccionesVentas = transaccionesTurno.length;
            const ticketPromedio = transaccionesVentas > 0 ? totalVentas / transaccionesVentas : 0;

            const ventasPorMetodoPago = [
                {
                    metodoPagoId: 1,
                    nombre: 'Efectivo en Caja',
                    total: totalVentasEfectivo,
                    transacciones: opsEfectivo,
                },
                {
                    metodoPagoId: 2,
                    nombre: 'Tarjeta en Terminal (Vouchers)',
                    total: totalVentasTerminal,
                    transacciones: opsTerminal,
                },
                {
                    metodoPagoId: 3,
                    nombre: 'Mercado Pago Digital / En Línea',
                    total: totalVentasDigital,
                    transacciones: opsDigital,
                },
            ];

            return this.respuestaExito(
                res,
                {
                    apertura,
                    montoInicial,
                    totalEntradas,
                    totalSalidas,
                    saldoDisponible,
                    efectivoEsperado: saldoDisponible,
                    movimientos,
                    movimientosPendientes,
                    movimientosValidados,
                    totalVentas: resumenVentas.totalVentas,
                    totalVentasEfectivo: resumenVentas.totalVentasEfectivo,
                    totalVentasCanceladas: resumenVentas.totalVentasCanceladas,
                    totalVentasEfectivoCanceladas: resumenVentas.totalVentasEfectivoCanceladas,
                    totalVentasEfectivoBruto: resumenVentas.totalVentasEfectivoBruto,
                    cantidadVentas: resumenVentas.cantidadVentas,
                    promedioVentas: resumenVentas.promedioVentas,
                    ventasPorMetodoPago: resumenVentas.ventasPorMetodoPago,
                    totales: {
                        totalVentas: resumenVentas.totalVentas,
                        transaccionesVentas: resumenVentas.cantidadVentas,
                        ticketPromedio: resumenVentas.promedioVentas,
                        ventasPorMetodoPago: resumenVentas.ventasPorMetodoPago,
                        totalVentasCanceladas: resumenVentas.totalVentasCanceladas,
                        cantidadVentasCanceladas: resumenVentas.cantidadVentasCanceladas,
                        totalVentasEfectivo: resumenVentas.totalVentasEfectivo,
                    },
                },
                'Resumen de apertura obtenido correctamente'
            );
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    validarCampos({ aperturaCajaId, empleadoId, tipo, monto, concepto, observaciones }) {
        if (!aperturaCajaId || isNaN(Number(aperturaCajaId)))
            throw new Error('La apertura de caja es requerida');
        if (!empleadoId || isNaN(Number(empleadoId))) throw new Error('El empleado es requerido');
        if (!tipo?.trim()) throw new Error('El tipo de movimiento es requerido');
        if (!TIPOS_VALIDOS.includes(tipo.trim().toUpperCase()))
            throw new Error('El tipo de movimiento debe ser ENTRADA o SALIDA');
        if (monto === undefined || monto === null || isNaN(Number(monto)))
            throw new Error('El monto es requerido');
        if (Number(monto) <= 0) throw new Error('El monto debe ser mayor a 0');
        if (Number(monto) > 50000) throw new Error('El monto no puede exceder el límite de $50,000.00');
        if (!concepto?.trim()) throw new Error('El concepto del movimiento es requerido');
        if (concepto.trim().length > 255) throw new Error('El concepto no puede exceder 255 caracteres');
        if (observaciones && observaciones.trim().length > 500)
            throw new Error('Las observaciones no pueden exceder 500 caracteres');
    }
}

export const movimientoCajaController = new MovimientoCajaController();
