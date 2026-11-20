import { servicioDao } from "../dao/ServicioDao.js";
import { BaseController } from "./BaseController.js";
import { ResponseModel } from "../modelos/ResponseModel.js";
import { validarEstadoCatalogo } from "../utils/constantes.js";
import { eliminarImagen, obtenerImagen } from "../middleware/uploadMiddleware.js";

function normalizarBooleano(valor, valorPorDefecto = true) {
    if (valor === undefined || valor === null || valor === '') return valorPorDefecto;
    if (valor === true || valor === 'true') return true;
    if (valor === false || valor === 'false') return false;
    throw new Error('El campo disponibleCompra debe ser booleano');
}

export class ServicioController extends BaseController {
    constructor() {
        super(servicioDao);
    }

    crear = async (req, res) => {
        const imagen = obtenerImagen('servicios', req.file);
        let imagenPersistida = false;
        try {
            const { nombre, descripcion, precio, estado, disponibleCompra } = req.body;
            this.validar({ nombre, precio, estado });

            const servicioAgregado = await this.dao.create({
                nombre: nombre.trim(),
                descripcion: descripcion ? descripcion.trim() : null,
                precio: Number(precio),
                estado: validarEstadoCatalogo(estado),
                disponibleCompra: normalizarBooleano(disponibleCompra),
                imagenUrl: imagen?.url ?? null,
                imagenPublicId: imagen?.publicId ?? null,
            });
            imagenPersistida = true;

            return this.respuestaExito(res, servicioAgregado, "Servicio añadido correctamente.");
        } catch (error) {
            if (imagen && !imagenPersistida) {
                try {
                    await eliminarImagen('servicios', imagen);
                } catch (errorLimpieza) {
                    console.error('[Servicios] No se pudo limpiar la imagen subida:', errorLimpieza);
                }
            }
            return this.respuestaError(res, error);
        }
    };

    actualizar = async (req, res) => {
        const imagenNueva = obtenerImagen('servicios', req.file);
        let imagenPersistida = false;
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) {
                throw new Error("ID no válido");
            }
            const servicioAnterior = await this.dao.getById(id, this.obtenerEmpresaId(req));
            if (!servicioAnterior) return this.respuestaNoEncontrado(res, 'Servicio no encontrado');

            const { nombre, descripcion, precio, estado, disponibleCompra, quitarImagen } = req.body;
            this.validar({ nombre, precio, estado });
            const quitarImagenSolicitado = normalizarBooleano(quitarImagen, false);

            const camposImagen = imagenNueva
                ? { imagenUrl: imagenNueva.url, imagenPublicId: imagenNueva.publicId }
                : quitarImagenSolicitado
                    ? { imagenUrl: null, imagenPublicId: null }
                    : {};

            const servicioActualizado = await this.dao.update(id, {
                nombre: nombre.trim(),
                descripcion: descripcion ? descripcion.trim() : null,
                precio: Number(precio),
                estado: validarEstadoCatalogo(estado),
                disponibleCompra: normalizarBooleano(disponibleCompra),
                ...camposImagen,
            }, this.obtenerEmpresaId(req));
            imagenPersistida = true;

            if ((imagenNueva || quitarImagenSolicitado) && (servicioAnterior.imagenUrl || servicioAnterior.imagenPublicId)) {
                try {
                    await eliminarImagen('servicios', {
                        url: servicioAnterior.imagenUrl,
                        publicId: servicioAnterior.imagenPublicId,
                    });
                } catch (error) {
                    console.error(`[Servicios] No se pudo eliminar la imagen anterior del servicio ${id}:`, error);
                    return this.respuestaExito(
                        res,
                        servicioActualizado,
                        `Servicio actualizado, pero no se pudo eliminar la imagen anterior: ${error.message}`
                    );
                }
            }

            return this.respuestaExito(res, servicioActualizado, "Servicio actualizado correctamente.");
        } catch (error) {
            if (imagenNueva && !imagenPersistida) {
                try {
                    await eliminarImagen('servicios', imagenNueva);
                } catch (errorLimpieza) {
                    console.error('[Servicios] No se pudo limpiar la nueva imagen subida:', errorLimpieza);
                }
            }
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

    obtenerDisponiblesParaVenta = async (req, res) => {
        try {
            const sucursalId = this.obtenerSucursalId(req);
            if (sucursalId === 'todas') {
                return res.status(400).json(new ResponseModel(
                    null,
                    1,
                    'Selecciona una sucursal específica para consultar servicios de venta',
                    400
                ));
            }
            const servicios = await servicioDao.getAll(
                {
                    disponibleCompra: true,
                    estado: 'ACTIVO',
                },
                { id: 'desc' },
                this.obtenerEmpresaId(req),
                sucursalId
            );
            return this.respuestaExito(res, servicios, "Servicios cargados con exito");
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    getServiciosCliente = async (req, res) => this.obtenerDisponiblesParaVenta(req, res);
}

export const servicioController = new ServicioController();
