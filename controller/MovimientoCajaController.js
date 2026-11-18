import { movimientoCajaDao } from '../dao/MovimientoCajaDao.js';
import { BaseController } from './BaseController.js';
import { prisma } from '../dao/BaseDao.js';
import currency from 'currency.js';
import { ventaDao } from '../dao/VentaDao.js';
import { calcularEfectivoEsperado, obtenerTotalesMovimientos } from '../utils/calcularEfectivoCaja.js';

const TIPOS_VALIDOS = ['ENTRADA', 'SALIDA'];

export class MovimientoCajaController extends BaseController {
    constructor() {
        super(movimientoCajaDao);
    }
    crear = async (req, res) => {
        try {
            const { aperturaCajaId, empleadoId, tipo, monto, concepto, observaciones } = req.body;

            this.validarCampos({ aperturaCajaId, empleadoId, tipo, monto, concepto, observaciones });

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
                    const totalesEfectivo = await obtenerTotalesMovimientos({
                        aperturaCajaId: idApertura,
                        soloEfectivo: true,
                        client: tx,
                    });

                    const saldoDisponible = calcularEfectivoEsperado({
                        montoInicial: apertura.montoInicial,
                        totalEntradas: totalesEfectivo.totalEntradas,
                        totalSalidas: totalesEfectivo.totalSalidas,
                    });

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
                        afectaEfectivo: true,
                        observaciones: observaciones ? observaciones.trim() : null,
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
            const id = Number(req.params.id);
            if (isNaN(id)) throw new Error('ID no válido');

            const movimientoExistente = await prisma.movimientoCaja.findUnique({
                where: { id, deletedAt: null },
            });
            if (!movimientoExistente) throw new Error('Movimiento de caja no encontrado');
            if (movimientoExistente.estado === 'VALIDADO') {
                throw new Error('No se puede editar un movimiento de caja que ya ha sido validado');
            }

            const { aperturaCajaId, empleadoId, tipo, monto, concepto, observaciones } = req.body;
            this.validarCampos({ aperturaCajaId, empleadoId, tipo, monto, concepto, observaciones });

            const registro = await this.dao.update(id, {
                aperturaCajaId: Number(aperturaCajaId),
                empleadoId: Number(empleadoId),
                tipo: tipo.trim().toUpperCase(),
                monto: Number(monto),
                concepto: concepto.trim(),
                observaciones: observaciones !== undefined ? (observaciones ? observaciones.trim() : null) : undefined,
            });

            return this.respuestaExito(res, registro, 'Movimiento de caja actualizado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    eliminar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) throw new Error('ID no válido');

            const movimientoExistente = await prisma.movimientoCaja.findUnique({
                where: { id, deletedAt: null },
            });
            if (!movimientoExistente) throw new Error('Movimiento de caja no encontrado');
            if (movimientoExistente.estado === 'VALIDADO') {
                throw new Error('No se puede eliminar un movimiento de caja que ya ha sido validado');
            }

            const registro = await this.dao.delete(id);
            return this.respuestaExito(res, registro, 'Movimiento de caja eliminado correctamente');
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
            });
            if (!movimientoExistente) throw new Error('Movimiento de caja no encontrado');

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

            const [
                totalesGenerales,
                totalesEfectivo,
                movimientos,
                resumenVentas,
                corteGuardado,
            ] = await Promise.all([
                obtenerTotalesMovimientos({ aperturaCajaId }),
                obtenerTotalesMovimientos({ aperturaCajaId, soloEfectivo: true }),
                this.dao.getAllByApertura(aperturaCajaId),
                ventaDao.obtenerResumenVentasPorApertura(aperturaCajaId),
                apertura.estado === 'CERRADA'
                    ? prisma.corteCaja.findFirst({
                          where: { aperturaCajaId, deletedAt: null },
                          orderBy: [{ fechaCorte: 'desc' }, { id: 'desc' }],
                          select: {
                              efectivoEsperado: true,
                              efectivoContado: true,
                              diferencia: true,
                          },
                      })
                    : Promise.resolve(null),
            ]);

            const totalEntradas = totalesGenerales.totalEntradas;
            const totalSalidas = totalesGenerales.totalSalidas;
            const montoInicial = currency(String(apertura.montoInicial ?? 0)).value;
            let saldoDisponible;
            if (apertura.estado === 'CERRADA') {
                if (!corteGuardado) {
                    throw new Error('No se encontró el corte guardado para consultar el saldo histórico de esta apertura.');
                }
                saldoDisponible = corteGuardado.efectivoEsperado !== null
                    ? currency(String(corteGuardado.efectivoEsperado)).value
                    : currency(String(corteGuardado.efectivoContado))
                        .subtract(String(corteGuardado.diferencia))
                        .value;
            } else if (apertura.estado === 'ABIERTA') {
                saldoDisponible = calcularEfectivoEsperado({
                    montoInicial,
                    totalEntradas: totalesEfectivo.totalEntradas,
                    totalSalidas: totalesEfectivo.totalSalidas,
                });
            } else {
                throw new Error('La apertura no tiene un estado que permita consultar su saldo.');
            }
            const movimientosPendientes = movimientos.filter((m) => m.estado !== 'VALIDADO').length;
            const movimientosValidados = movimientos.filter((m) => m.estado === 'VALIDADO').length;

            return this.respuestaExito(
                res,
                {
                    apertura,
                    montoInicial,
                    totalEntradas,
                    totalSalidas,
                    totalEntradasEfectivo: totalesEfectivo.totalEntradas,
                    totalSalidasEfectivo: totalesEfectivo.totalSalidas,
                    saldoDisponible,
                    efectivoEsperado: saldoDisponible,
                    movimientos,
                    movimientosPendientes,
                    movimientosValidados,
                    
                    totalVentas: resumenVentas.totalVentas,
                    totalVentasEfectivo: resumenVentas.totalVentasEfectivo,
                    totalVentasCanceladas: resumenVentas.totalVentasCanceladas,
                    totalVentasEfectivoCanceladas: resumenVentas.totalVentasEfectivoCanceladas,
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
        if (Number(monto) > 9999999.99) throw new Error('El monto no puede exceder $9,999,999.99');
        if (!concepto?.trim()) throw new Error('El concepto del movimiento es requerido');
        if (concepto.trim().length > 255) throw new Error('El concepto no puede exceder 255 caracteres');
        if (observaciones && observaciones.trim().length > 500)
            throw new Error('Las observaciones no pueden exceder 500 caracteres');
    }
}

export const movimientoCajaController = new MovimientoCajaController();
