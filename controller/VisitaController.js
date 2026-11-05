import { visitaDao } from '../dao/VisitaDao.js';
import { tipoVisitaDao } from '../dao/TipoVisitaDao.js';
import { BaseController } from './BaseController.js';

export class VisitaController extends BaseController {
    constructor() {
        super(visitaDao);
    }

    /**
     * POST /api/visitas
     * Registra un visitante eventual sin membresía.
     * Body: { nombreVisitante, tipoVisitaId, observaciones? }
     */
    crear = async (req, res) => {
        try {
            const { nombreVisitante, tipoVisitaId, observaciones } = req.body;

            // Validaciones
            if (!nombreVisitante?.trim()) throw new Error('El nombre del visitante es requerido');
            if (!tipoVisitaId) throw new Error('El tipo de visita es requerido');

            // Obtener costo actual del tipo de visita
            const tipoVisita = await tipoVisitaDao.getById(Number(tipoVisitaId));
            if (!tipoVisita) throw new Error('El tipo de visita especificado no existe');

            // Registrar la visita con el costo actual del catálogo
            const visita = await this.dao.create({
                nombreVisitante: nombreVisitante.trim(),
                tipoVisitaId: Number(tipoVisitaId),
                costo: tipoVisita.costo,
                observaciones: observaciones ? observaciones.trim() : null,
                fechaHora: new Date()
            });

            // Obtener visita completa con relaciones para la respuesta
            const visitaCompleta = await this.dao.getById(visita.id);

            /* ── MOVIMIENTO DE CAJA (pendiente de activar) ──────────────────────
             * Cuando se confirme la integración con caja, descomentar este bloque:
             *
             * import { movimientoCajaDao } from '../dao/MovimientoCajaDao.js';
             * await movimientoCajaDao.create({
             *     aperturaCajaId: req.aperturaCajaActiva.id,  // obtenido del middleware o session
             *     empleadoId: req.usuario.empleadoId,
             *     tipo: 'ENTRADA',
             *     monto: tipoVisita.costo,
             *     concepto: `Visita temporal - ${nombreVisitante.trim()}`,
             *     estado: 'COMPLETADO'
             * });
             * ────────────────────────────────────────────────────────────────── */

            return this.respuestaExito(res, visitaCompleta, 'Visita registrada correctamente');
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

            let visitas;
            if (fechaInicio && fechaFin) {
                visitas = await this.dao.obtenerVisitasPorPeriodo(fechaInicio, fechaFin);
            } else if (fechaInicio) {
                // Solo fecha inicio → busca ese día
                visitas = await this.dao.obtenerVisitasPorPeriodo(fechaInicio, fechaInicio);
            } else {
                // Sin filtro → todo el día de hoy por defecto
                const hoy = new Date().toISOString().split('T')[0];
                visitas = await this.dao.obtenerVisitasPorPeriodo(hoy, hoy);
            }

            return this.respuestaExito(res, visitas, 'Visitas obtenidas exitosamente');
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
