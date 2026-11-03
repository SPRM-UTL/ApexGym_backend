import { appMembresiaDao } from '../dao/AppMembresiaDao.js';
import { BaseController } from './BaseController.js';

export class AppMembresiaController extends BaseController {
    constructor() {
        super(appMembresiaDao);
    }

    /**
     * Endpoint para consultar la membresía actual del cliente, vigencia,
     * días restantes y lista de beneficios incluidos.
     * GET /api/app/membresia/mi-membresia
     */
    obtenerMiMembresia = async (req, res) => {
        try {
            const usuarioId = req.usuario?.id;
            const clienteIdParam = req.query.clienteId ? Number(req.query.clienteId) : null;

            if (!usuarioId && !clienteIdParam) {
                return this.respuestaNoAutorizado(res, 'Sesión no válida');
            }

            const resultado = await this.dao.getMiMembresia(usuarioId, clienteIdParam);

            if (!resultado.encontrado) {
                return this.respuestaNoEncontrado(res, resultado.mensaje || 'Cliente no encontrado');
            }

            return this.respuestaExito(res, resultado, 'Información de membresía obtenida correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    /**
     * Endpoint para consultar el saldo pendiente y estado financiero de la membresía.
     * GET /api/app/membresia/mi-saldo
     */
    obtenerMiSaldo = async (req, res) => {
        try {
            const usuarioId = req.usuario?.id;
            const clienteIdParam = req.query.clienteId ? Number(req.query.clienteId) : null;

            if (!usuarioId && !clienteIdParam) {
                return this.respuestaNoAutorizado(res, 'Sesión no válida');
            }

            const resultado = await this.dao.getMiSaldo(usuarioId, clienteIdParam);

            if (!resultado.encontrado) {
                return this.respuestaNoEncontrado(res, resultado.mensaje || 'Cliente no encontrado');
            }

            return this.respuestaExito(res, resultado, 'Estado de cuenta y saldo consultado con éxito');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    /**
     * Endpoint para consultar el catálogo de planes activos con sus beneficios.
     * GET /api/app/membresia/planes
     */
    obtenerPlanes = async (req, res) => {
        try {
            const planes = await this.dao.getPlanesDisponibles();
            return this.respuestaExito(res, planes, 'Catálogo de planes obtenido exitosamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };
}

export const appMembresiaController = new AppMembresiaController();
