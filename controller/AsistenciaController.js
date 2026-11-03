import { BaseController } from './BaseController.js';
import { asistenciaDao } from '../dao/AsistenciaDao.js';

export class AsistenciaController extends BaseController {
    constructor() {
        super(asistenciaDao);
    }

    /**
     * Valida la membresía de un socio y registra la entrada si cumple los criterios
     * POST /api/asistencias/validar-acceso
     */
    validarAcceso = async (req, res) => {
        try {
            const { identificador, observaciones } = req.body;

            if (!identificador) {
                return res.status(400).json({
                    estado: 1,
                    mensaje: 'Debe proporcionar un identificador de socio (ID, código, correo o teléfono)',
                    datos: null
                });
            }

            const resultado = await this.dao.validarYRegistrarAcceso({
                identificador,
                observaciones
            });

            return this.respuestaExito(
                res,
                resultado,
                resultado.mensaje || (resultado.acceso ? 'Acceso concedido' : 'Acceso denegado')
            );
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    /**
     * Registra una visita individual / temporal
     * POST /api/asistencias/visitas
     */
    registrarVisita = async (req, res) => {
        try {
            const { nombreVisitante, tipoVisitaId, costo, observaciones } = req.body;

            if (!nombreVisitante || !String(nombreVisitante).trim()) {
                throw new Error('El nombre del visitante es obligatorio');
            }
            if (!tipoVisitaId) {
                throw new Error('El tipo de visita es obligatorio');
            }

            const visitaRegistrada = await this.dao.registrarVisita({
                nombreVisitante,
                tipoVisitaId,
                costo,
                observaciones
            });

            return this.respuestaExito(
                res,
                visitaRegistrada,
                'Visita registrada exitosamente'
            );
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    /**
     * Devuelve el aforo actual y métricas del día
     * GET /api/asistencias/aforo
     */
    obtenerAforo = async (req, res) => {
        try {
            const aforo = await this.dao.getAforoActual();
            return this.respuestaExito(res, aforo, 'Aforo obtenido exitosamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    /**
     * Devuelve el historial paginado de asistencias de socios
     * GET /api/asistencias/historial
     */
    obtenerHistorial = async (req, res) => {
        try {
            const { fechaInicio, fechaFin, clienteId, take, skip } = req.query;

            const historial = await this.dao.getHistorialAsistencias({
                fechaInicio,
                fechaFin,
                clienteId,
                take: take ? Number(take) : 50,
                skip: skip ? Number(skip) : 0
            });

            return this.respuestaExito(res, historial, 'Historial de asistencias obtenido exitosamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    /**
     * Devuelve el historial paginado de visitas temporales
     * GET /api/asistencias/visitas
     */
    obtenerVisitas = async (req, res) => {
        try {
            const { fechaInicio, fechaFin, tipoVisitaId, take, skip } = req.query;

            const visitas = await this.dao.getHistorialVisitas({
                fechaInicio,
                fechaFin,
                tipoVisitaId,
                take: take ? Number(take) : 50,
                skip: skip ? Number(skip) : 0
            });

            return this.respuestaExito(res, visitas, 'Historial de visitas obtenido exitosamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };
}

export const asistenciaController = new AsistenciaController();
