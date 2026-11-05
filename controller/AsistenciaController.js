import { asistenciaDao } from '../dao/AsistenciaDao.js';
import { clienteDao } from '../dao/ClienteDao.js';
import { clienteMembresiaDao } from '../dao/ClienteMembresiaDao.js';
import { BaseController } from './BaseController.js';

export class AsistenciaController extends BaseController {
    constructor() {
        super(asistenciaDao);
    }

    /**
     * GET /api/asistencias/buscar-cliente?q=termino
     * Busca clientes por nombre para el flujo de recepción.
     */
    buscarCliente = async (req, res) => {
        try {
            const termino = (req.query.q || '').trim();
            if (!termino || termino.length < 2) {
                return this.respuestaExito(res, [], 'Ingresa al menos 2 caracteres para buscar');
            }
            const clientes = await clienteDao.buscarPorNombre(termino);
            return this.respuestaExito(res, clientes, 'Clientes encontrados');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    /**
     * POST /api/asistencias/validar-y-registrar
     * Valida la membresía del cliente y registra el acceso si está vigente.
     * Body: { clienteId, observaciones? }
     */
    validarYRegistrar = async (req, res) => {
        try {
            const { clienteId, observaciones } = req.body;

            if (!clienteId) {
                throw new Error('El clienteId es requerido');
            }

            // 1. Verificar que el cliente existe con sus datos completos y usuario
            const cliente = await clienteDao.getById(Number(clienteId));
            if (!cliente) {
                return this.respuestaNoEncontrado(res, 'Cliente no encontrado');
            }

            // 2. Verificar vigencia de membresía
            // getActivaPorCliente también sincroniza las membresías vencidas en BD
            const membresiaActiva = await clienteMembresiaDao.getActivaPorCliente(Number(clienteId));

            if (!membresiaActiva) {
                // Consultar la última membresía para proporcionar detalles exactos
                const historial = await clienteMembresiaDao.getHistorialPorCliente(Number(clienteId));
                const ultimaMembresia = (historial && historial.length > 0) ? historial[0] : null;

                let mensajeExplicativo = 'Membresía inexistente o no asignada';
                if (ultimaMembresia && ultimaMembresia.fechaFin) {
                    const fechaFinUTC = new Date(ultimaMembresia.fechaFin);
                    const dia = String(fechaFinUTC.getUTCDate()).padStart(2, '0');
                    const mes = String(fechaFinUTC.getUTCMonth() + 1).padStart(2, '0');
                    const anio = fechaFinUTC.getUTCFullYear();
                    mensajeExplicativo = `Membresía vencida el ${dia}/${mes}/${anio}`;
                }

                const response = {
                    acceso: false,
                    codigo: 'MEMBRESIA_NO_VIGENTE',
                    cliente,
                    membresia: ultimaMembresia,
                    mensaje: mensajeExplicativo
                };

                return res.status(400).json({
                    data: response,
                    statusCode: 400,
                    message: `Acceso denegado: ${mensajeExplicativo}`,
                    responseFlag: 1
                });
            }

            // 3. Registrar la asistencia
            const asistencia = await this.dao.create({
                clienteId: Number(clienteId),
                clienteMembresiaId: membresiaActiva.id,
                observaciones: observaciones ? observaciones.trim() : null,
                fechaHora: new Date()
            });

            // 4. Obtener asistencia completa con relaciones para la respuesta
            const asistenciaCompleta = await this.dao.getById(asistencia.id);

            // Calcular días restantes de vigencia
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);
            const fin = new Date(membresiaActiva.fechaFin);
            fin.setHours(0, 0, 0, 0);
            const diffTime = fin.getTime() - hoy.getTime();
            const diasRestantes = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

            const response = {
                acceso: true,
                codigo: 'ACCESO_AUTORIZADO',
                cliente,
                membresia: membresiaActiva,
                asistencia: asistenciaCompleta,
                diasRestantes,
                fechaExpiracion: membresiaActiva.fechaFin,
                mensaje: 'Acceso autorizado - Membresía Vigente'
            };

            return this.respuestaExito(res, response, 'Acceso autorizado y asistencia registrada');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    /**
     * GET /api/asistencias/cliente/:clienteId
     * Historial de entradas de un cliente con paginación.
     * Query: ?limite=20&pagina=1
     */
    historialPorCliente = async (req, res) => {
        try {
            const clienteId = Number(req.params.clienteId);
            if (isNaN(clienteId)) throw new Error('ID de cliente no válido');

            const limite = Number(req.query.limite) || 20;
            const pagina = Number(req.query.pagina) || 1;

            const resultado = await this.dao.obtenerHistorialPorCliente(clienteId, { limite, pagina });
            return this.respuestaExito(res, resultado, 'Historial obtenido exitosamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    /**
     * GET /api/asistencias/hoy
     * Todos los ingresos del día actual y conteo total (aforo).
     * Query opcional: ?fecha=YYYY-MM-DD para consultar otro día
     */
    obtenerHoy = async (req, res) => {
        try {
            const fecha = req.query.fecha || null;
            const asistencias = await this.dao.obtenerAsistenciasDelDia(fecha);
            return this.respuestaExito(res, {
                total: asistencias.length,
                asistencias
            }, 'Asistencias del día obtenidas');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    /**
     * DELETE /api/asistencias/:id
     * Eliminación lógica de una asistencia.
     */
    eliminar = async (req, res) => {
        try {
            const registro = await this.dao.delete(Number(req.params.id));
            return this.respuestaExito(res, registro, 'Asistencia eliminada correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };
}

export const asistenciaController = new AsistenciaController();
