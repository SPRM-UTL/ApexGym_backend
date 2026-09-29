import { categoriaProductoDao } from "../dao/CategoriaProductoDao.js";
import { BaseController } from "./BaseController.js";

export class CategoriaProductoController extends BaseController {
    constructor() {
        super(categoriaProductoDao);
    }

    crear = async (req, res) => {
        const { nombre, descripcion } = req.body;
        try {
            const nuevaCategoria = await categoriaProductoDao.create({ nombre, descripcion });
            return this.respuestaExito(res, nuevaCategoria, "Categoría creada exitosamente");
        } catch (error) {
            return this.respuestaError(res, error);
        }
    }

    actualizar = async (req, res) => {
        const { id, nombre, descripcion, estado } = req.body;
        try {
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