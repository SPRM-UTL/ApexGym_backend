import { almacenDao } from '../dao/AlmacenDao.js';
import { ResponseModel } from '../modelos/ResponseModel.js';
import { BaseController } from './BaseController.js';

function crearErrorHttp(mensaje, status = 400) {
    const error = new Error(mensaje);
    error.status = status;
    return error;
}

export class AlmacenController extends BaseController {
    constructor(dao = almacenDao) {
        super(dao);
    }

    manejarError(res, error) {
        if ([400, 403, 404, 409].includes(error?.status)) {
            return res.status(error.status).json(
                new ResponseModel(null, 1, error.message, error.status)
            );
        }
        return this.respuestaError(res, error);
    }

    leerIdPositivo(valor, nombre = 'registro') {
        const id = Number(valor);
        if (!Number.isSafeInteger(id) || id < 1) {
            throw crearErrorHttp(`El identificador del ${nombre} no es válido`, 400);
        }
        return id;
    }

    obtenerTodos = async (req, res) => {
        try {
            const empresaId = this.obtenerEmpresaId(req);
            const sucursalId = this.obtenerSucursalId(req);
            const almacenes = await this.dao.obtenerPorSucursal(empresaId, sucursalId);
            return this.respuestaExito(res, almacenes, 'Almacenes obtenidos correctamente');
        } catch (error) {
            return this.manejarError(res, error);
        }
    };

    obtenerPorId = async (req, res) => {
        try {
            const id = this.leerIdPositivo(req.params.id, 'almacén');
            const almacen = await this.dao.obtenerPorId(
                id,
                this.obtenerEmpresaId(req),
                this.obtenerSucursalId(req)
            );
            if (!almacen) {
                return this.respuestaNoEncontrado(res, 'Almacén no encontrado');
            }
            return this.respuestaExito(res, almacen, 'Almacén obtenido correctamente');
        } catch (error) {
            return this.manejarError(res, error);
        }
    };

    crear = async (req, res) => {
        try {
            const { nombre, codigo, tipo, ubicacion, esPrincipal, activo } = req.body ?? {};
            const sucursalReq = this.obtenerSucursalId(req);
            const sucursalBody = req.body?.sucursalId !== undefined ? Number(req.body.sucursalId) : null;
            const sucursalId = sucursalReq === 'todas'
                ? (Number.isSafeInteger(sucursalBody) && sucursalBody > 0 ? sucursalBody : 1)
                : sucursalReq;

            const almacen = await this.dao.crear({
                empresaId: this.obtenerEmpresaId(req),
                sucursalId,
                nombre,
                codigo,
                tipo,
                ubicacion,
                esPrincipal,
                activo,
            });
            return res.status(201).json(
                new ResponseModel(almacen, 0, 'Almacén creado correctamente', 201)
            );
        } catch (error) {
            return this.manejarError(res, error);
        }
    };

    actualizar = async (req, res) => {
        try {
            const id = this.leerIdPositivo(req.params.id, 'almacén');
            const { nombre, codigo, tipo, ubicacion, esPrincipal, activo } = req.body ?? {};
            const almacen = await this.dao.actualizar(id, {
                empresaId: this.obtenerEmpresaId(req),
                sucursalId: this.obtenerSucursalId(req),
                nombre,
                codigo,
                tipo,
                ubicacion,
                esPrincipal,
                activo,
            });
            return this.respuestaExito(res, almacen, 'Almacén actualizado correctamente');
        } catch (error) {
            return this.manejarError(res, error);
        }
    };

    eliminar = async (req, res) => {
        try {
            const id = this.leerIdPositivo(req.params.id, 'almacén');
            const almacen = await this.dao.eliminar(id, {
                empresaId: this.obtenerEmpresaId(req),
                sucursalId: this.obtenerSucursalId(req),
            });
            return this.respuestaExito(res, almacen, 'Almacén eliminado correctamente');
        } catch (error) {
            return this.manejarError(res, error);
        }
    };

    obtenerInventario = async (req, res) => {
        try {
            const almacenId = this.leerIdPositivo(req.params.id, 'almacén');
            const resultado = await this.dao.obtenerInventario(
                almacenId,
                this.obtenerEmpresaId(req),
                this.obtenerSucursalId(req)
            );
            return this.respuestaExito(res, resultado, 'Inventario del almacén obtenido correctamente');
        } catch (error) {
            return this.manejarError(res, error);
        }
    };

    ajustarStock = async (req, res) => {
        try {
            const almacenId = this.leerIdPositivo(req.params.id, 'almacén');
            const productoId = this.leerIdPositivo(req.params.productoId, 'producto');
            const { stockActual, stockMinimo, ubicacionEstante } = req.body ?? {};

            if (stockActual === undefined || stockActual === null || stockActual === '') {
                throw crearErrorHttp('El campo stockActual es obligatorio', 400);
            }

            const resultado = await this.dao.ajustarStock({
                almacenId,
                productoId,
                empresaId: this.obtenerEmpresaId(req),
                sucursalId: this.obtenerSucursalId(req),
                stockActual,
                stockMinimo,
                ubicacionEstante,
            });
            return this.respuestaExito(res, resultado, 'Inventario actualizado correctamente');
        } catch (error) {
            return this.manejarError(res, error);
        }
    };

    transferirStock = async (req, res) => {
        try {
            const { origenAlmacenId, destinoAlmacenId, productoId, cantidad } = req.body ?? {};
            const resultado = await this.dao.transferirStock({
                origenAlmacenId,
                destinoAlmacenId,
                productoId,
                cantidad,
                empresaId: this.obtenerEmpresaId(req),
                sucursalId: this.obtenerSucursalId(req),
            });
            return this.respuestaExito(res, resultado, 'Stock transferido correctamente entre almacenes');
        } catch (error) {
            return this.manejarError(res, error);
        }
    };
}

export const almacenController = new AlmacenController();
