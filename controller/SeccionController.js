import { seccionDao } from "../dao/SeccionDao.js";
import { BaseController } from "./BaseController.js";

export class SeccionController extends BaseController {
    constructor() {
        super(seccionDao);
    }

    /**
     * GET /api/secciones/mis-secciones
     * Devuelve las secciones con los módulos a los que el usuario tiene permiso.
     */
    obtenerMisSecciones = async (req, res) => {
        try {
            const usuarioId = req.usuario?.id;
            const secciones = await seccionDao.obtenerSeccionesConModulosPermitidos(usuarioId);
            return this.respuestaExito(res, secciones, "Secciones obtenidas correctamente");
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };
}
