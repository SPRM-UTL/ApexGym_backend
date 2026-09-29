import { tipoActividadDao } from '../dao/TipoActividadDao.js';
import { BaseController } from './BaseController.js';

export class TipoActividadController extends BaseController {
    constructor() {
        super(tipoActividadDao);
    }

    crear = async (req, res) => {
        try {
            const { areaTrabajoId, nombre, descripcion, estado } = req.body;
            this.validar({ nombre, estado });
            const registro = await this.dao.create({
                areaTrabajoId: areaTrabajoId ? Number(areaTrabajoId) : null,
                nombre: nombre.trim(),
                descripcion,
                estado: estado.trim().toUpperCase(),
            });
            return this.respuestaExito(res, registro, 'Tipo de actividad creado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    actualizar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            const { areaTrabajoId, nombre, descripcion, estado } = req.body;
            this.validar({ nombre, estado });
            const registro = await this.dao.update(id, {
                areaTrabajoId: areaTrabajoId ? Number(areaTrabajoId) : null,
                nombre: nombre.trim(),
                descripcion,
                estado: estado.trim().toUpperCase(),
            });
            return this.respuestaExito(res, registro, 'Tipo de actividad actualizado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    eliminar = async (req, res) => {
        try {
            const registro = await this.dao.delete(Number(req.params.id));
            return this.respuestaExito(res, registro, 'Tipo de actividad eliminado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    validar({ nombre, estado }) {
        if (!nombre?.trim()) throw new Error('El nombre es requerido');
        if (!estado?.trim()) throw new Error('El estado es requerido');
    }
}

export const tipoActividadController = new TipoActividadController();
