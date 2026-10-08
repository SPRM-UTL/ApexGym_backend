import { areaTrabajoDao } from '../dao/AreaTrabajoDao.js';
import { BaseController } from './BaseController.js';

export class AreaTrabajoController extends BaseController {
    constructor() {
        super(areaTrabajoDao);
    }

    crear = async (req, res) => {
        try {
            const { nombre, descripcion, estado } = req.body;
            this.validar({ nombre, descripcion, estado });
            const registro = await this.dao.create({
                nombre: nombre.trim(),
                descripcion: descripcion ? descripcion.trim() : null,
                estado: estado.trim().toUpperCase(),
            });
            return this.respuestaExito(res, registro, 'Área de trabajo creada correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    actualizar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) throw new Error('ID no válido');
            const { nombre, descripcion, estado } = req.body;
            this.validar({ nombre, descripcion, estado });
            const registro = await this.dao.update(id, {
                nombre: nombre.trim(),
                descripcion: descripcion ? descripcion.trim() : null,
                estado: estado.trim().toUpperCase(),
            });
            return this.respuestaExito(res, registro, 'Área de trabajo actualizada correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    eliminar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) throw new Error('ID no válido');
            const registro = await this.dao.delete(id);
            return this.respuestaExito(res, registro, 'Área de trabajo eliminada correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    validar({ nombre, descripcion, estado }) {
        if (!nombre?.trim()) throw new Error('El nombre del área de trabajo es requerido');
        if (nombre.trim().length > 100) throw new Error('El nombre del área de trabajo no puede exceder 100 caracteres');
        if (descripcion && descripcion.trim().length > 500) throw new Error('La descripción no puede exceder 500 caracteres');
        if (!estado?.trim()) throw new Error('El estado del área de trabajo es requerido');
        if (estado.trim().length > 30) throw new Error('El estado no puede exceder 30 caracteres');
    }
}

export const areaTrabajoController = new AreaTrabajoController();
