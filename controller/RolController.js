import { rolDao } from "../dao/RolDao.js";
import { BaseController } from "./BaseController.js";

export class RolController extends BaseController {
    constructor() {
        super(rolDao);
    }

    asignarRol = async (req, res) => {
        const { usuarioId, rolId } = req.body;
        try {
            const resultado = await rolDao.asignarARol(Number(usuarioId), Number(rolId));
            return this.respuestaExito(res, resultado, "Rol asignado exitosamente");
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    removerRol = async (req, res) => {
        const { usuarioId, rolId } = req.body;
        try {
            const resultado = await rolDao.removerDeUsuario(Number(usuarioId), Number(rolId));
            return this.respuestaExito(res, resultado, "Rol removido exitosamente");
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };
}
