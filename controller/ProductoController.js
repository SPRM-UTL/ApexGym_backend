import { productoDao } from "../dao/ProductoDao.js";
import { BaseController } from "./BaseController.js";
import { ResponseModel } from "../modelos/ResponseModel.js";
import {
    validarEstadoCatalogo,
} from "../utils/constantes.js";
import {
    eliminarImagen,
    obtenerImagen,
} from "../middleware/uploadMiddleware.js";

function normalizarBooleano(valor, valorPorDefecto) {
    if (valor === undefined || valor === null || valor === '') {
        return valorPorDefecto;
    }
    if (valor === true || valor === 'true') return true;
    if (valor === false || valor === 'false') return false;
    throw new Error('El campo disponibleCompra debe ser booleano');
}

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
            estado,
        } = req.body;
        const imagen = obtenerImagen('productos', req.file);
        let imagenPersistida = false;
        try {
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
                disponibleCompra: normalizarBooleano(disponibleCompra, true),
                estado: validarEstadoCatalogo(estado),
                imagenUrl: imagen?.url ?? null,
                imagenPublicId: imagen?.publicId ?? null,
            });
            imagenPersistida = true;
            return this.respuestaExito(res, productoAgregado, "Producto añadido con éxito");
        } catch (error) {
            let errorRespuesta = error;
            if (imagen && !imagenPersistida) {
                try {
                    await eliminarImagen('productos', imagen);
                } catch (errorLimpieza) {
                    console.error('[Productos] No se pudo limpiar la imagen subida:', errorLimpieza);
                    errorRespuesta = new Error(
                        `${error instanceof Error ? error.message : String(error)}. No se pudo limpiar la imagen subida: ${errorLimpieza.message}`
                    );
                }
            }
            return this.respuestaError(res, errorRespuesta);
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
            estado,
            quitarImagen,
        } = req.body;
        const imagenNueva = obtenerImagen('productos', req.file);
        let imagenPersistida = false;
        try {
            const id = Number(productoId);
            const productoAnterior = await productoDao.getById(id, this.obtenerEmpresaId(req));
            if (!productoAnterior) {
                if (imagenNueva) {
                    try {
                        await eliminarImagen('productos', imagenNueva);
                    } catch (errorLimpieza) {
                        console.error('[Productos] No se pudo limpiar la imagen del producto inexistente:', errorLimpieza);
                        return this.respuestaError(
                            res,
                            new Error(`Producto no encontrado. No se pudo limpiar la nueva imagen: ${errorLimpieza.message}`)
                        );
                    }
                }
                return this.respuestaNoEncontrado(res, 'Producto no encontrado');
            }

            const quitarImagenSolicitado = normalizarBooleano(quitarImagen, false);
            const camposImagen = imagenNueva
                ? { imagenUrl: imagenNueva.url, imagenPublicId: imagenNueva.publicId }
                : quitarImagenSolicitado
                    ? { imagenUrl: null, imagenPublicId: null }
                    : {};
            const cambioImagen = Boolean(imagenNueva) || quitarImagenSolicitado;

            const productoEditado = await productoDao.update(id, {
                ...(categoriaProductoId && { categoriaProductoId: Number(categoriaProductoId) }),
                ...(codigoBarras !== undefined && { codigoBarras: codigoBarras || null }),
                ...(nombre && { nombre }),
                ...(descripcion !== undefined && { descripcion: descripcion || null }),
                ...(precioVenta !== undefined && { precioVenta: parseFloat(precioVenta) }),
                ...(descuentoPorcentaje !== undefined && {
                    descuentoPorcentaje: normalizarDescuentoPorcentaje(descuentoPorcentaje),
                }),
                ...(precioCompra !== undefined && { precioCompra: precioCompra ? parseFloat(precioCompra) : null }),
                ...(stockActual !== undefined && { stockActual: Number(stockActual) }),
                ...(stockMinimo !== undefined && { stockMinimo: Number(stockMinimo) }),
                ...(disponibleCompra !== undefined && {
                    disponibleCompra: normalizarBooleano(disponibleCompra, true),
                }),
                ...(estado !== undefined && { estado: validarEstadoCatalogo(estado) }),
                ...camposImagen,
            });
            imagenPersistida = true;

            if (cambioImagen && (productoAnterior.imagenUrl || productoAnterior.imagenPublicId)) {
                try {
                    await eliminarImagen('productos', {
                        url: productoAnterior.imagenUrl,
                        publicId: productoAnterior.imagenPublicId,
                    });
                } catch (error) {
                    console.error(`[Productos] No se pudo eliminar la imagen anterior del producto ${id}:`, error);
                    return this.respuestaExito(
                        res,
                        productoEditado,
                        `Producto actualizado, pero no se pudo eliminar la imagen anterior: ${error.message}`
                    );
                }
            }

            return this.respuestaExito(res, productoEditado, "Producto editado con exito");
        } catch (error) {
            let errorRespuesta = error;
            if (imagenNueva && !imagenPersistida) {
                try {
                    await eliminarImagen('productos', imagenNueva);
                } catch (errorLimpieza) {
                    console.error('[Productos] No se pudo limpiar la nueva imagen subida:', errorLimpieza);
                    errorRespuesta = new Error(
                        `${error instanceof Error ? error.message : String(error)}. No se pudo limpiar la nueva imagen: ${errorLimpieza.message}`
                    );
                }
            }
            return this.respuestaError(res, errorRespuesta);
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

    obtenerDisponiblesParaVenta = async (req, res) => {
        try {
            const sucursalId = this.obtenerSucursalId(req);
            if (sucursalId === 'todas') {
                return res.status(400).json(new ResponseModel(
                    null,
                    1,
                    'Selecciona una sucursal específica para consultar productos de venta',
                    400
                ));
            }
            const productos = await productoDao.getAll(
                {
                    disponibleCompra: true,
                    estado: 'ACTIVO',
                },
                { id: 'desc' },
                this.obtenerEmpresaId(req),
                sucursalId
            );
            return this.respuestaExito(res, productos, "Productos cargados con exito");
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    getProductosCliente = async (req, res) => this.obtenerDisponiblesParaVenta(req, res);
}
