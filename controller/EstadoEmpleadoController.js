import { estadoEmpleadoDao } from '../dao/EstadoEmpleadoDao.js';
import { BaseController } from './BaseController.js';

export class EstadoEmpleadoController extends BaseController {
    constructor() {
        super(estadoEmpleadoDao);
    }

    crear = async (req, res) => {
        try {
            const { nombre, descripcion } = req.body;
            this.validar({ nombre, descripcion });
            const registro = await this.dao.create({
                nombre: nombre.trim(),
                descripcion: descripcion ? descripcion.trim() : null,
            });
            return this.respuestaExito(res, registro, 'Estado de empleado creado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    actualizar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) throw new Error('ID no válido');
            const { nombre, descripcion } = req.body;
            this.validar({ nombre, descripcion });
            const registro = await this.dao.update(id, {
                nombre: nombre.trim(),
                descripcion: descripcion ? descripcion.trim() : null,
            });
            return this.respuestaExito(res, registro, 'Estado de empleado actualizado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    eliminar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) throw new Error('ID no válido');
            const registro = await this.dao.delete(id);
            return this.respuestaExito(res, registro, 'Estado de empleado eliminado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    validar({ nombre, descripcion }) {
        if (!nombre?.trim()) throw new Error('El nombre del estado de empleado es requerido');
        if (nombre.trim().length > 100) throw new Error('El nombre del estado de empleado no puede exceder 100 caracteres');
        if (descripcion && descripcion.trim().length > 500) throw new Error('La descripción no puede exceder 500 caracteres');
    }
}

export const estadoEmpleadoController = new EstadoEmpleadoController();
