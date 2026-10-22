import { servicioDao } from "../dao/ServicioDao.js";
import { BaseController } from "./BaseController.js";

export class ServicioController extends BaseController {
    constructor() {
        super(servicioDao);
    }

    crear = async (req, res) => {
        try {
            const { nombre, descripcion, precio, estado } = req.body;
            this.validar({ nombre, precio, estado });

            const servicioAgregado = await this.dao.create({
                nombre: nombre.trim(),
                descripcion: descripcion ? descripcion.trim() : null,
                precio: Number(precio),
                estado: estado ? estado.trim().toUpperCase() : 'ACTIVO',
            });

            return this.respuestaExito(res, servicioAgregado, "Servicio añadido correctamente.");
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    actualizar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) {
                throw new Error("ID no válido");
            }
            const { nombre, descripcion, precio, estado } = req.body;
            this.validar({ nombre, precio, estado });

            const servicioActualizado = await this.dao.update(id, {
                nombre: nombre.trim(),
                descripcion: descripcion ? descripcion.trim() : null,
                precio: Number(precio),
                estado: estado ? estado.trim().toUpperCase() : 'ACTIVO',
            });

            return this.respuestaExito(res, servicioActualizado, "Servicio actualizado correctamente.");
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    eliminar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) {
                throw new Error("ID no válido");
            }
            const servicioEliminado = await this.dao.delete(id);
            return this.respuestaExito(res, servicioEliminado, "Servicio eliminado exitosamente.");
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    validar({ nombre, precio, estado }) {
        if (!nombre?.trim()) throw new Error('El nombre es requerido');
        if (precio === undefined || precio === null || isNaN(Number(precio)) || Number(precio) < 0) {
            throw new Error('El precio debe ser un número válido mayor o igual a 0');
        }
        if (!estado?.trim()) throw new Error('El estado es requerido');
    }
}

export const servicioController = new ServicioController();
