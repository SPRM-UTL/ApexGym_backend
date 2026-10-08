import { cajaDao } from '../dao/CajaDao.js';
import { BaseController } from './BaseController.js';

export class CajaController extends BaseController {
    constructor() {
        super(cajaDao);
    }

    crear = async (req, res) => {
        try {
            const { nombre, ubicacion, estado } = req.body;
            this.validar({ nombre, ubicacion, estado });
            const registro = await this.dao.create({
                nombre: nombre.trim(),
                ubicacion: ubicacion ? ubicacion.trim() : null,
                estado: estado.trim().toUpperCase(),
            });
            return this.respuestaExito(res, registro, 'Caja creada correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    actualizar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) throw new Error('ID no válido');
            const { nombre, ubicacion, estado } = req.body;
            this.validar({ nombre, ubicacion, estado });
            const registro = await this.dao.update(id, {
                nombre: nombre.trim(),
                ubicacion: ubicacion ? ubicacion.trim() : null,
                estado: estado.trim().toUpperCase(),
            });
            return this.respuestaExito(res, registro, 'Caja actualizada correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    eliminar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) throw new Error('ID no válido');
            const registro = await this.dao.delete(id);
            return this.respuestaExito(res, registro, 'Caja eliminada correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    validar({ nombre, ubicacion, estado }) {
        if (!nombre?.trim()) throw new Error('El nombre de la caja es requerido');
        if (nombre.trim().length > 100) throw new Error('El nombre de la caja no puede exceder 100 caracteres');
        if (ubicacion && ubicacion.trim().length > 255) throw new Error('La ubicación no puede exceder 255 caracteres');
        if (!estado?.trim()) throw new Error('El estado de la caja es requerido');
        if (estado.trim().length > 30) throw new Error('El estado no puede exceder 30 caracteres');
    }
}

export const cajaController = new CajaController();
