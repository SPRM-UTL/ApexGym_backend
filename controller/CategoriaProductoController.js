import { categoriaProductoDao } from "../dao/CategoriaProductoDao.js";
import { BaseController } from "./BaseController.js";

export class CategoriaProductoController extends BaseController {
    constructor() {
        super(categoriaProductoDao);
    }

    crear = async (req, res) => {
        const { nombre, descripcion } = req.body;
        try {
            if (!nombre || !nombre.trim()) {
                throw new Error("El nombre de la categoría es requerido.");
            }
            if (nombre.trim().length > 100) {
                throw new Error("El nombre no puede exceder los 100 caracteres.");
            }
            if (descripcion && descripcion.trim().length > 500) {
                throw new Error("La descripción no puede exceder los 500 caracteres.");
            }
            const nuevaCategoria = await categoriaProductoDao.create({ nombre, descripcion });
            return this.respuestaExito(res, nuevaCategoria, "Categoría creada exitosamente");
        } catch (error) {
            return this.respuestaError(res, error);
        }
    }

    actualizar = async (req, res) => {
        const id = Number(req.params.id || req.body.id);
        const { nombre, descripcion, estado } = req.body;
        try {
             if (!nombre || !nombre.trim()) {
                throw new Error("El nombre de la categoría es requerido.");
            }
            if (nombre.trim().length > 100) {
                throw new Error("El nombre no puede exceder los 100 caracteres.");
            }
            if (descripcion && descripcion.trim().length > 500) {
                throw new Error("La descripción no puede exceder los 500 caracteres.");
            }
            const categoriaActualizada = await categoriaProductoDao.update(id, { nombre, descripcion, estado });
            return this.respuestaExito(res, categoriaActualizada, "Categoría actualizada exitosamente");
        } catch (error) {
            return this.respuestaError(res, error);
        }
    }

    eliminar = async (req, res) => {
        const { id } = req.body;
        try {
            const categoriaEliminada = await categoriaProductoDao.delete(id);
            return this.respuestaExito(res, categoriaEliminada, "Categoría eliminada exitosamente");
        } catch (error) {
            return this.respuestaError(res, error);
        }
    }
}

// Exportamos la clase para instanciarla en las rutas (igual que UsuarioController)