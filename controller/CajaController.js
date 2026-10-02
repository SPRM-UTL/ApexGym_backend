import { cajaDao } from '../dao/CajaDao.js';
import { BaseController } from './BaseController.js';

export class CajaController extends BaseController {
    constructor() {
        super(cajaDao);
    }

    crear = async (req, res) => {
        try {
            const { nombre, ubicacion, estado } = req.body;
            this.validar({ nombre, estado });
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
            this.validar({ nombre, estado });
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

    validar({ nombre, estado }) {
        if (!nombre?.trim()) throw new Error('El nombre de la caja es requerido');
        if (!estado?.trim()) throw new Error('El estado de la caja es requerido');
    }
}

export const cajaController = new CajaController();
