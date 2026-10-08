import { puestoDao } from '../dao/PuestoDao.js';
import { BaseController } from './BaseController.js';

export class PuestoController extends BaseController {
    constructor() {
        super(puestoDao);
    }

    crear = async (req, res) => {
        try {
            const { areaTrabajoId, nombre, descripcion, salarioBase, estado } = req.body;
            this.validar({ areaTrabajoId, nombre, descripcion, salarioBase, estado });
            const registro = await this.dao.create({
                areaTrabajoId: Number(areaTrabajoId),
                nombre: nombre.trim(),
                descripcion: descripcion ? descripcion.trim() : null,
                salarioBase: Number(salarioBase),
                estado: estado.trim().toUpperCase(),
            });
            return this.respuestaExito(res, registro, 'Puesto creado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    actualizar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) throw new Error('ID no válido');
            const { areaTrabajoId, nombre, descripcion, salarioBase, estado } = req.body;
            this.validar({ areaTrabajoId, nombre, descripcion, salarioBase, estado });
            const registro = await this.dao.update(id, {
                areaTrabajoId: Number(areaTrabajoId),
                nombre: nombre.trim(),
                descripcion: descripcion ? descripcion.trim() : null,
                salarioBase: Number(salarioBase),
                estado: estado.trim().toUpperCase(),
            });
            return this.respuestaExito(res, registro, 'Puesto actualizado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    eliminar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) throw new Error('ID no válido');
            const registro = await this.dao.delete(id);
            return this.respuestaExito(res, registro, 'Puesto eliminado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    validar({ areaTrabajoId, nombre, descripcion, salarioBase, estado }) {
        if (!areaTrabajoId || isNaN(Number(areaTrabajoId))) {
            throw new Error('El área de trabajo es requerida y debe ser un ID válido');
        }
        if (!nombre?.trim()) throw new Error('El nombre del puesto es requerido');
        if (nombre.trim().length > 100) throw new Error('El nombre del puesto no puede exceder 100 caracteres');
        if (descripcion && descripcion.trim().length > 500) throw new Error('La descripción no puede exceder 500 caracteres');
        if (salarioBase === undefined || salarioBase === null || isNaN(Number(salarioBase)) || Number(salarioBase) < 0) {
            throw new Error('El salario base es requerido y debe ser un número mayor o igual a 0');
        }
        if (Number(salarioBase) > 9999999.99) {
            throw new Error('El salario base no puede exceder $9,999,999.99');
        }
        if (!estado?.trim()) throw new Error('El estado del puesto es requerido');
        if (estado.trim().length > 30) throw new Error('El estado no puede exceder 30 caracteres');
    }
}

export const puestoController = new PuestoController();
