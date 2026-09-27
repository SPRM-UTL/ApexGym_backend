import { rolDao } from "../dao/RolDao.js";
import { BaseController } from "./BaseController.js";

export class RolController extends BaseController {
    constructor() {
        super(rolDao);
    }

    obtenerPermisos = async (req, res) => {
        try {
            return this.respuestaExito(res, await this.dao.obtenerPermisos(), 'Permisos obtenidos correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    crear = async (req, res) => {
        try {
            const { nombre, descripcion, permisosIds = [] } = req.body;
            this.validar(nombre);
            const rol = await this.dao.crearRol({
                nombre: nombre.trim(),
                descripcion,
                permisosIds,
            });
            return this.respuestaExito(res, rol, 'Rol creado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    actualizar = async (req, res) => {
        try {
            const { nombre, descripcion, permisosIds = [] } = req.body;
            this.validar(nombre);
            const rol = await this.dao.actualizarRol(Number(req.params.id), {
                nombre: nombre.trim(),
                descripcion,
                permisosIds,
            });
            return this.respuestaExito(res, rol, 'Rol actualizado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    eliminar = async (req, res) => {
        try {
            const rol = await this.dao.eliminarRol(Number(req.params.id));
            return this.respuestaExito(res, rol, 'Rol eliminado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    validar(nombre) {
        if (!nombre?.trim()) throw new Error('El nombre del rol es requerido');
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
