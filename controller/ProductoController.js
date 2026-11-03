import { productoDao } from "../dao/ProductoDao.js";
import { BaseController } from "./BaseController.js";
import { guardarImagenServidor } from "../utilidades/guardarImagen.js";

export class ProductoController extends BaseController {
    constructor() {
        super(productoDao);
    }

    crear = async (req, res) => {
        const {
            categoriaProductoId,
            codigoBarras,
            nombre,
            descripcion,
            precioVenta,
            precioCompra,
            stockActual,
            stockMinimo,
            disponibleCompra,
            imagenUrl,
            imagenPublicId,
        } = req.body;
        try {
            const rutaImagen = imagenUrl ? guardarImagenServidor(imagenUrl, 'productos') : null;

            const productoAgregado = await productoDao.create({
                categoriaProductoId: Number(categoriaProductoId),
                codigoBarras: codigoBarras || null,
                nombre,
                descripcion: descripcion || null,
                precioVenta: parseFloat(precioVenta),
                precioCompra: precioCompra ? parseFloat(precioCompra) : null,
                stockActual: stockActual ? Number(stockActual) : 0,
                stockMinimo: stockMinimo ? Number(stockMinimo) : 1,
                disponibleCompra: disponibleCompra !== undefined ? Boolean(disponibleCompra) : true,
                imagenUrl: rutaImagen,
                imagenPublicId: imagenPublicId ? imagenPublicId.trim() : null,
            });
            return this.respuestaExito(res, productoAgregado, "Producto añadido con éxito");
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    actualizar = async (req, res) => {
        const {
            productoId,
            categoriaProductoId,
            codigoBarras,
            nombre,
            descripcion,
            precioVenta,
            precioCompra,
            stockActual,
            stockMinimo,
            disponibleCompra,
            imagenUrl,
            imagenPublicId,
        } = req.body;
        try {
            const rutaImagen = imagenUrl !== undefined ? guardarImagenServidor(imagenUrl, 'productos') : undefined;

            const productoEditado = await productoDao.update(productoId, {
                ...(categoriaProductoId && { categoriaProductoId: Number(categoriaProductoId) }),
                ...(codigoBarras !== undefined && { codigoBarras }),
                ...(nombre && { nombre }),
                ...(descripcion !== undefined && { descripcion }),
                ...(precioVenta !== undefined && { precioVenta: parseFloat(precioVenta) }),
                ...(precioCompra !== undefined && { precioCompra: precioCompra ? parseFloat(precioCompra) : null }),
                ...(stockActual !== undefined && { stockActual: Number(stockActual) }),
                ...(stockMinimo !== undefined && { stockMinimo: Number(stockMinimo) }),
                ...(disponibleCompra !== undefined && { disponibleCompra: Boolean(disponibleCompra) }),
                ...(rutaImagen !== undefined && { imagenUrl: rutaImagen }),
                ...(imagenPublicId !== undefined && { imagenPublicId: imagenPublicId ? imagenPublicId.trim() : null }),
            });
            return this.respuestaExito(res, productoEditado, "Producto editado con exito");
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    eliminar = async (req, res) => {
        const { productoId } = req.body;
        try {
            const productoEliminado = await productoDao.delete(productoId);
            return this.respuestaExito(res, productoEliminado, "Producto eliminado con éxito");
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    getProductosCliente = async (req, res) => {
        try {
            const productos = await productoDao.getAll({ disponibleCompra: true });
            return this.respuestaExito(res, productos, "Productos cargados con exito");
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };
}
