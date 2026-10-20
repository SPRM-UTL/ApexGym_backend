import { tipoVisitaDao } from '../dao/TipoVisitaDao.js';
import { BaseController } from './BaseController.js';

export class TipoVisitaController extends BaseController {
    constructor() {
        super(tipoVisitaDao);
    }

    crear = async (req, res) => {
        try {
            const { nombre, descripcion, costo, estado } = req.body;
            this.validar({ nombre, costo, estado });
            
            const registro = await this.dao.create({
                nombre: nombre.trim(),
                descripcion: descripcion ? descripcion.trim() : null,
                costo: Number(costo),
                estado: estado.trim().toUpperCase()
            });
            
            return this.respuestaExito(res, registro, 'Tipo de visita creado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    actualizar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            const { nombre, descripcion, costo, estado } = req.body;
            this.validar({ nombre, costo, estado });
            
            const registro = await this.dao.update(id, {
                nombre: nombre.trim(),
                descripcion: descripcion ? descripcion.trim() : null,
                costo: Number(costo),
                estado: estado.trim().toUpperCase()
            });
            
            return this.respuestaExito(res, registro, 'Tipo de visita actualizado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    eliminar = async (req, res) => {
        try {
            const registro = await this.dao.delete(Number(req.params.id));
            return this.respuestaExito(res, registro, 'Tipo de visita eliminado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    validar({ nombre, costo, estado }) {
        if (!nombre?.trim()) throw new Error('El nombre es requerido');
        if (costo === undefined || costo === null) throw new Error('El costo es requerido');
        if (!estado?.trim()) throw new Error('El estado es requerido');
    }
}

export const tipoVisitaController = new TipoVisitaController();
