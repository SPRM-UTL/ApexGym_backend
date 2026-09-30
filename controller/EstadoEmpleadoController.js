import { estadoEmpleadoDao } from '../dao/EstadoEmpleadoDao.js';
import { BaseController } from './BaseController.js';

export class EstadoEmpleadoController extends BaseController {
    constructor() {
        super(estadoEmpleadoDao);
    }

    crear = async (req, res) => {
        try {
            const { nombre, descripcion } = req.body;
            this.validar({ nombre });
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
            this.validar({ nombre });
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

    validar({ nombre }) {
        if (!nombre?.trim()) throw new Error('El nombre del estado de empleado es requerido');
    }
}

export const estadoEmpleadoController = new EstadoEmpleadoController();
