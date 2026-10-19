import { estadoMembresiaDao } from '../dao/EstadoMembresiaDao.js';
import { BaseController } from './BaseController.js';

export class EstadoMembresiaController extends BaseController {
    constructor() {
        super(estadoMembresiaDao);
    }

    crear = async (req, res) => {
        try {
            const { nombre, descripcion } = req.body;
            this.validar({ nombre });
            
            const registro = await this.dao.create({
                nombre: nombre.trim(),
                descripcion: descripcion ? descripcion.trim() : null,
            });
            
            return this.respuestaExito(res, registro, 'Estado de membresía creado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    actualizar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            const { nombre, descripcion } = req.body;
            this.validar({ nombre });
            
            const registro = await this.dao.update(id, {
                nombre: nombre.trim(),
                descripcion: descripcion ? descripcion.trim() : null,
            });
            
            return this.respuestaExito(res, registro, 'Estado de membresía actualizado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    eliminar = async (req, res) => {
        try {
            const registro = await this.dao.delete(Number(req.params.id));
            return this.respuestaExito(res, registro, 'Estado de membresía eliminado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    validar({ nombre }) {
        if (!nombre?.trim()) throw new Error('El nombre es requerido');
    }
}

export const estadoMembresiaController = new EstadoMembresiaController();
