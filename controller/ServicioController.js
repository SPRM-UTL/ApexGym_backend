import { servicioDao } from "../dao/ServicioDao.js";
import { BaseController } from "./BaseController.js";
import { guardarImagenServidor } from "../utils/guardarImagen.js";
import { ResponseModel } from "../modelos/ResponseModel.js";
import { validarEstadoCatalogo } from "../utils/constantes.js";

export class ServicioController extends BaseController {
    constructor() {
        super(servicioDao);
    }

    crear = async (req, res) => {
        try {
            const { nombre, descripcion, precio, estado, disponibleCompra, imagenUrl, imagenPublicId } = req.body;
            this.validar({ nombre, precio, estado });

            const rutaImagen = imagenUrl ? guardarImagenServidor(imagenUrl, 'servicios') : null;

            const servicioAgregado = await this.dao.create({
                nombre: nombre.trim(),
                descripcion: descripcion ? descripcion.trim() : null,
                precio: Number(precio),
                estado: validarEstadoCatalogo(estado),
                disponibleCompra: disponibleCompra !== undefined ? Boolean(disponibleCompra) : true,
                imagenUrl: rutaImagen,
                imagenPublicId: imagenPublicId ? imagenPublicId.trim() : null,
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
            const { nombre, descripcion, precio, estado, disponibleCompra, imagenUrl, imagenPublicId } = req.body;
            this.validar({ nombre, precio, estado });

            const rutaImagen = imagenUrl !== undefined
                ? guardarImagenServidor(imagenUrl, 'servicios')
                : undefined;

            const servicioActualizado = await this.dao.update(id, {
                nombre: nombre.trim(),
                descripcion: descripcion ? descripcion.trim() : null,
                precio: Number(precio),
                estado: validarEstadoCatalogo(estado),
                disponibleCompra: disponibleCompra !== undefined ? Boolean(disponibleCompra) : true,
                ...(rutaImagen !== undefined && { imagenUrl: rutaImagen }),
                ...(imagenPublicId !== undefined && { imagenPublicId: imagenPublicId ? imagenPublicId.trim() : null }),
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
            const servicios = await servicioDao.obtenerDisponiblesParaVenta(
                this.obtenerEmpresaId(req),
                sucursalId
            );
            return this.respuestaExito(res, servicios, "Servicios disponibles para venta cargados correctamente");
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    getServiciosCliente = async (req, res) => this.obtenerDisponiblesParaVenta(req, res);
}

export const servicioController = new ServicioController();
