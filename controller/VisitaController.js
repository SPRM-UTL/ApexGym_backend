import { visitaDao } from '../dao/VisitaDao.js';
import { tipoVisitaDao } from '../dao/TipoVisitaDao.js';
import { BaseController } from './BaseController.js';

export class VisitaController extends BaseController {
    constructor() {
        super(visitaDao);
    }

    /**
     * POST /api/visitas
     * Registra un visitante eventual sin membresía e integra el cobro en Caja.
     * Body: { nombreVisitante, tipoVisitaId, observaciones?, metodoPago? }
     */
    crear = async (req, res) => {
        try {
            const { nombreVisitante, tipoVisitaId, observaciones, metodoPago = 'EFECTIVO' } = req.body;

            // Validaciones
            if (!nombreVisitante?.trim()) throw new Error('El nombre del visitante es requerido');
            if (!tipoVisitaId) throw new Error('El tipo de visita es requerido');

            // Obtener costo actual del tipo de visita
            const tipoVisita = await tipoVisitaDao.getById(Number(tipoVisitaId));
            if (!tipoVisita) throw new Error('El tipo de visita especificado no existe');

            const empresaId = this.obtenerEmpresaId(req);
            const sucursalId = this.obtenerSucursalId(req);
            const costoNumero = Number(tipoVisita.costo || 0);

            // Registrar la visita con el costo actual del catálogo
            const visita = await this.dao.create({
                empresaId,
                sucursalId: typeof sucursalId === 'number' ? sucursalId : 1,
                nombreVisitante: nombreVisitante.trim(),
                tipoVisitaId: Number(tipoVisitaId),
                costo: tipoVisita.costo,
                observaciones: observaciones ? observaciones.trim() : null,
                fechaHora: new Date()
            });

            // Registrar automáticamente el cobro en Caja si el costo es mayor a 0
            let movimientoCaja = null;
            if (costoNumero > 0) {
                try {
                    const cajaActiva = await this.dao.prisma.aperturaCaja.findFirst({
                        where: {
                            ...(typeof sucursalId === 'number' ? { sucursalId } : { empresaId }),
                            estado: 'ABIERTA',
                            deletedAt: null,
                        },
                        orderBy: { id: 'desc' },
                    });

                    if (cajaActiva) {
                        const empleadoId = req.usuario?.empleadoId ?? req.user?.empleadoId ?? cajaActiva.empleadoId;
                        const metodoNormalizado = String(metodoPago || 'EFECTIVO').toUpperCase();
                        const esEfectivo = metodoNormalizado === 'EFECTIVO';

                        movimientoCaja = await this.dao.prisma.movimientoCaja.create({
                            data: {
                                empresaId,
                                sucursalId: cajaActiva.sucursalId,
                                aperturaCajaId: cajaActiva.id,
                                empleadoId,
                                tipo: 'ENTRADA',
                                origen: 'MANUAL',
                                monto: costoNumero,
                                concepto: `Cobro Visita: ${nombreVisitante.trim()} (${tipoVisita.nombre})`,
                                estado: 'VALIDADO',
                                afectaEfectivo: esEfectivo,
                                observaciones: `Pase temporal en recepción. Método: ${metodoNormalizado}`,
                            }
                        });
                    }
                } catch (cajaErr) {
                    console.error('Advertencia: No se pudo registrar movimiento de caja para visita:', cajaErr);
                }
            }

            // Obtener visita completa con relaciones para la respuesta
            const visitaCompleta = await this.dao.getById(visita.id);

            return this.respuestaExito(
                res,
                { ...visitaCompleta, movimientoCaja },
                movimientoCaja
                    ? `Visita registrada y cobro de $${costoNumero.toFixed(2)} registrado en caja`
                    : 'Visita registrada correctamente'
            );
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    /**
     * GET /api/visitas
     * Listado de visitas. Soporta filtro por rango de fechas.
     * Query: ?fechaInicio=YYYY-MM-DD&fechaFin=YYYY-MM-DD
     */
    obtenerTodos = async (req, res) => {
        try {
            const { fechaInicio, fechaFin } = req.query;
            const contexto = { sucursalId: req.query.sucursalId ?? null };

            let visitas;
            if (fechaInicio && fechaFin) {
                visitas = await this.dao.obtenerVisitasPorPeriodo(fechaInicio, fechaFin, contexto);
            } else if (fechaInicio) {
                // Solo fecha inicio → busca ese día
                visitas = await this.dao.obtenerVisitasPorPeriodo(fechaInicio, fechaInicio, contexto);
            } else {
                // Sin filtro → todo el día de hoy por defecto
                const hoy = new Date().toISOString().split('T')[0];
                visitas = await this.dao.obtenerVisitasPorPeriodo(hoy, hoy, contexto);
            }

            return this.respuestaExito(res, visitas, 'Visitas obtenidas exitosamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    /**
     * PUT /api/visitas/:id
     * Actualiza los datos operativos de una visita existente.
     */
    actualizar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!Number.isInteger(id) || id <= 0) throw new Error('ID de visita no válido');

            const visitaActual = await this.dao.getById(id);
            if (!visitaActual) return this.respuestaNoEncontrado(res, 'Visita no encontrada');

            const data = {};
            if (req.body.nombreVisitante !== undefined) {
                if (!req.body.nombreVisitante?.trim()) throw new Error('El nombre del visitante es requerido');
                data.nombreVisitante = req.body.nombreVisitante.trim();
            }
            if (req.body.tipoVisitaId !== undefined) {
                const tipoVisita = await tipoVisitaDao.getById(Number(req.body.tipoVisitaId));
                if (!tipoVisita) throw new Error('El tipo de visita especificado no existe');
                data.tipoVisitaId = tipoVisita.id;
                data.costo = tipoVisita.costo;
            }
            if (req.body.observaciones !== undefined) {
                data.observaciones = req.body.observaciones?.trim() || null;
            }

            await this.dao.update(id, data, this.obtenerEmpresaId(req));
            const visita = await this.dao.getById(id);
            return this.respuestaExito(res, visita, 'Visita actualizada correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    /**
     * DELETE /api/visitas/:id
     * Eliminación lógica de una visita.
     */
    eliminar = async (req, res) => {
        try {
            const registro = await this.dao.delete(Number(req.params.id));
            return this.respuestaExito(res, registro, 'Visita eliminada correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };
}

export const visitaController = new VisitaController();
