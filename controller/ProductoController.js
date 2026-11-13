import { productoDao } from "../dao/ProductoDao.js";
import { BaseController } from "./BaseController.js";
import {
    eliminarImagenCloudinary,
    guardarImagenServidor,
} from "../utilidades/guardarImagen.js";

function normalizarDescuentoPorcentaje(valor) {
    if (valor === undefined || valor === null || valor === '') {
        return 0;
    }

    if (typeof valor !== 'number' && typeof valor !== 'string') {
        throw new Error("El descuento debe ser un porcentaje numérico");
    }

    const texto = String(valor).trim();
    if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(texto)) {
        throw new Error("El descuento debe tener como máximo dos decimales");
    }

    const descuento = Number(texto);
    if (
        !Number.isFinite(descuento)
        || descuento < 0
        || descuento > 100
    ) {
        throw new Error("El descuento debe ser un porcentaje entre 0 y 100, con hasta dos decimales");
    }

    return descuento;
}

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
            descuentoPorcentaje,
            precioCompra,
            stockActual,
            stockMinimo,
            disponibleCompra,
            imagenUrl,
            imagenPublicId,
        } = req.body;
        try {
            const imagen = imagenUrl ? await guardarImagenServidor(imagenUrl, 'productos') : null;

            const productoAgregado = await productoDao.create({
                categoriaProductoId: Number(categoriaProductoId),
                codigoBarras: codigoBarras || null,
                nombre,
                descripcion: descripcion || null,
                precioVenta: parseFloat(precioVenta),
                descuentoPorcentaje: normalizarDescuentoPorcentaje(descuentoPorcentaje),
                precioCompra: precioCompra ? parseFloat(precioCompra) : null,
                stockActual: stockActual ? Number(stockActual) : 0,
                stockMinimo: stockMinimo ? Number(stockMinimo) : 1,
                disponibleCompra: disponibleCompra !== undefined ? Boolean(disponibleCompra) : true,
                imagenUrl: imagen?.url ?? null,
                imagenPublicId: imagen?.publicId ?? (imagenPublicId ? imagenPublicId.trim() : null),
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
            descuentoPorcentaje,
            precioCompra,
            stockActual,
            stockMinimo,
            disponibleCompra,
            imagenUrl,
            imagenPublicId,
        } = req.body;
        try {
            const id = Number(productoId);
            const productoAnterior = await productoDao.getById(id, this.obtenerEmpresaId(req));
            if (!productoAnterior) {
                return this.respuestaNoEncontrado(res, 'Producto no encontrado');
            }

            let camposImagen = {};
            let publicIdImagenNueva = productoAnterior.imagenPublicId;
            let imagenSubida = null;
            let imagenSeReemplazo = false;
            if (imagenUrl === null || imagenUrl === '') {
                camposImagen = { imagenUrl: null, imagenPublicId: null };
                publicIdImagenNueva = null;
                imagenSeReemplazo = true;
            } else if (imagenUrl !== undefined) {
                const imagen = await guardarImagenServidor(imagenUrl, 'productos');
                camposImagen = { imagenUrl: imagen?.url ?? null };
                const urlSinCambios = imagen?.url === productoAnterior.imagenUrl;
                imagenSeReemplazo = !urlSinCambios;
                if (imagen?.publicId) {
                    imagenSubida = imagen;
                    publicIdImagenNueva = imagen.publicId;
                    camposImagen.imagenPublicId = imagen.publicId;
                } else if (!urlSinCambios) {
                    publicIdImagenNueva = imagenPublicId ? imagenPublicId.trim() : null;
                    camposImagen.imagenPublicId = publicIdImagenNueva;
                }
            } else if (imagenPublicId !== undefined) {
                camposImagen.imagenPublicId = imagenPublicId ? imagenPublicId.trim() : null;
                publicIdImagenNueva = camposImagen.imagenPublicId;
            }

            let productoEditado;
            try {
                productoEditado = await productoDao.update(id, {
                    ...(categoriaProductoId && { categoriaProductoId: Number(categoriaProductoId) }),
                    ...(codigoBarras !== undefined && { codigoBarras }),
                    ...(nombre && { nombre }),
                    ...(descripcion !== undefined && { descripcion }),
                    ...(precioVenta !== undefined && { precioVenta: parseFloat(precioVenta) }),
                    ...(descuentoPorcentaje !== undefined && {
                        descuentoPorcentaje: normalizarDescuentoPorcentaje(descuentoPorcentaje),
                    }),
                    ...(precioCompra !== undefined && { precioCompra: precioCompra ? parseFloat(precioCompra) : null }),
                    ...(stockActual !== undefined && { stockActual: Number(stockActual) }),
                    ...(stockMinimo !== undefined && { stockMinimo: Number(stockMinimo) }),
                    ...(disponibleCompra !== undefined && { disponibleCompra: Boolean(disponibleCompra) }),
                    ...camposImagen,
                });
            } catch (error) {
                if (imagenSubida?.publicId) {
                    try {
                        await eliminarImagenCloudinary(imagenSubida.publicId);
                    } catch (errorLimpieza) {
                        throw new Error(`${error.message}. No se pudo limpiar la nueva imagen de Cloudinary: ${errorLimpieza.message}`);
                    }
                }
                throw error;
            }

            const publicIdAnterior = productoAnterior.imagenPublicId;
            if (imagenSeReemplazo && publicIdAnterior && publicIdAnterior !== publicIdImagenNueva) {
                try {
                    await eliminarImagenCloudinary(publicIdAnterior);
                } catch (error) {
                    return this.respuestaError(
                        res,
                        new Error(`Producto actualizado, pero no se pudo eliminar la imagen anterior de Cloudinary: ${error.message}`)
                    );
                }
            }

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
