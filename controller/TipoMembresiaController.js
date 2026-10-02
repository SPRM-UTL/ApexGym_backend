import { tipoMembresiaDao } from '../dao/TipoMembresiaDao.js';
import { BaseController } from './BaseController.js';

export class TipoMembresiaController extends BaseController {
    constructor() {
        super(tipoMembresiaDao);
    }

    crear = async (req, res) => {
        try {
            const { nombre, descripcion, duracionDias, precio, estado } = req.body;
            this.validar({ nombre, duracionDias, precio, estado });
            
            const registro = await this.dao.create({
                nombre: nombre.trim(),
                descripcion: descripcion ? descripcion.trim() : null,
                duracionDias: Number(duracionDias),
                precio: Number(precio),
                estado: estado.trim().toUpperCase()
            });
            
            return this.respuestaExito(res, registro, 'Tipo de membresía creado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    actualizar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            const { nombre, descripcion, duracionDias, precio, estado } = req.body;
            this.validar({ nombre, duracionDias, precio, estado });
            
            const registro = await this.dao.update(id, {
                nombre: nombre.trim(),
                descripcion: descripcion ? descripcion.trim() : null,
                duracionDias: Number(duracionDias),
                precio: Number(precio),
                estado: estado.trim().toUpperCase()
            });
            
            return this.respuestaExito(res, registro, 'Tipo de membresía actualizado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    eliminar = async (req, res) => {
        try {
            const registro = await this.dao.delete(Number(req.params.id));
            return this.respuestaExito(res, registro, 'Tipo de membresía eliminado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    validar({ nombre, duracionDias, precio, estado }) {
        if (!nombre?.trim()) throw new Error('El nombre es requerido');
        if (duracionDias === undefined || duracionDias === null) throw new Error('La duración en días es requerida');
        if (precio === undefined || precio === null) throw new Error('El precio es requerido');
        if (!estado?.trim()) throw new Error('El estado es requerido');
    }
}

export const tipoMembresiaController = new TipoMembresiaController();
