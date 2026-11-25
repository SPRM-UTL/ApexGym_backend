import { tipoMembresiaDao } from '../dao/TipoMembresiaDao.js';
import { BaseController } from './BaseController.js';
import { ResponseModel } from '../modelos/ResponseModel.js';
import { validarEstadoCatalogo } from '../utils/constantes.js';
import { eliminarImagen, obtenerImagen } from '../middleware/uploadMiddleware.js';

function normalizarBooleano(valor, valorPorDefecto) {
    if (valor === undefined || valor === null || valor === '') return valorPorDefecto;
    if (valor === true || valor === 'true') return true;
    if (valor === false || valor === 'false') return false;
    throw new Error('El campo quitarImagen debe ser booleano');
}

export class TipoMembresiaController extends BaseController {
    constructor() {
        super(tipoMembresiaDao);
    }

    crear = async (req, res) => {
        const imagen = obtenerImagen('membresias', req.file);
        let imagenPersistida = false;
        try {
            const { nombre, descripcion, duracionDias, precio, estado } = req.body;
            this.validar({ nombre, duracionDias, precio, estado });
            
            const registro = await this.dao.create({
                nombre: nombre.trim(),
                descripcion: descripcion ? descripcion.trim() : null,
                duracionDias: Number(duracionDias),
                precio: Number(precio),
                estado: validarEstadoCatalogo(estado),
                imagenUrl: imagen?.url ?? null,
                imagenPublicId: imagen?.publicId ?? null,
            }, this.obtenerEmpresaId(req), this.obtenerSucursalId(req));
            imagenPersistida = true;
            
            return this.respuestaExito(res, registro, 'Tipo de membresía creado correctamente');
        } catch (error) {
            let errorRespuesta = error;
            if (imagen && !imagenPersistida) {
                try {
                    await eliminarImagen('membresias', imagen);
                } catch (errorLimpieza) {
                    console.error('[TiposMembresia] No se pudo limpiar la imagen subida:', errorLimpieza);
                    const mensajeError = error instanceof Error ? error.message : String(error);
                    errorRespuesta = new Error(`${mensajeError}. No se pudo limpiar la imagen subida: ${errorLimpieza.message}`);
                }
            }
            return this.respuestaError(res, errorRespuesta);
        }
    };

    actualizar = async (req, res) => {
        const imagenNueva = obtenerImagen('membresias', req.file);
        let imagenPersistida = false;
        try {
            const id = Number(req.params.id);
            const { nombre, descripcion, duracionDias, precio, estado, quitarImagen } = req.body;
            this.validar({ nombre, duracionDias, precio, estado });
            const empresaId = this.obtenerEmpresaId(req);
            const sucursalId = this.obtenerSucursalId(req);
            const registroAnterior = await this.dao.getById(id, empresaId, sucursalId);
            if (!registroAnterior) {
                if (imagenNueva) {
                    try {
                        await eliminarImagen('membresias', imagenNueva);
                    } catch (errorLimpieza) {
                        console.error('[TiposMembresia] No se pudo limpiar la imagen del registro inexistente:', errorLimpieza);
                        return this.respuestaError(
                            res,
                            new Error(`Tipo de membresía no encontrado. No se pudo limpiar la nueva imagen: ${errorLimpieza.message}`)
                        );
                    }
                }
                return this.respuestaNoEncontrado(res, 'Tipo de membresía no encontrado');
            }
            const quitarImagenSolicitado = normalizarBooleano(quitarImagen, false);
            const camposImagen = imagenNueva
                ? { imagenUrl: imagenNueva.url, imagenPublicId: imagenNueva.publicId }
                : quitarImagenSolicitado
                    ? { imagenUrl: null, imagenPublicId: null }
                    : {};
            const cambioImagen = Boolean(imagenNueva) || quitarImagenSolicitado;
            const registro = await this.dao.update(id, {
                nombre: nombre.trim(),
                descripcion: descripcion ? descripcion.trim() : null,
                duracionDias: Number(duracionDias),
                precio: Number(precio),
                estado: validarEstadoCatalogo(estado),
                ...camposImagen,
            }, empresaId, sucursalId);
            imagenPersistida = true;

            if (cambioImagen && (registroAnterior.imagenUrl || registroAnterior.imagenPublicId)) {
                try {
                    await eliminarImagen('membresias', {
                        url: registroAnterior.imagenUrl,
                        publicId: registroAnterior.imagenPublicId,
                    });
                } catch (errorLimpieza) {
                    console.error(`[TiposMembresia] No se pudo eliminar la imagen anterior ${id}:`, errorLimpieza);
                    return this.respuestaExito(res, registro, `Tipo de membresía actualizado, pero no se pudo eliminar la imagen anterior: ${errorLimpieza.message}`);
                }
            }

            return this.respuestaExito(res, registro, 'Tipo de membresía actualizado correctamente');
        } catch (error) {
            let errorRespuesta = error;
            if (imagenNueva && !imagenPersistida) {
                try {
                    await eliminarImagen('membresias', imagenNueva);
                } catch (errorLimpieza) {
                    console.error('[TiposMembresia] No se pudo limpiar la nueva imagen subida:', errorLimpieza);
                    const mensajeError = error instanceof Error ? error.message : String(error);
                    errorRespuesta = new Error(`${mensajeError}. No se pudo limpiar la nueva imagen: ${errorLimpieza.message}`);
                }
            }
            return this.respuestaError(res, errorRespuesta);
        }
    };

    eliminar = async (req, res) => {
        try {
            const registro = await this.dao.delete(Number(req.params.id));
            return this.respuestaExito(res, registro, 'Tipo de membresía eliminado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    validar({ nombre, duracionDias, precio, estado }) {
        if (!nombre?.trim()) throw new Error('El nombre es requerido');
        if (duracionDias === undefined || duracionDias === null) throw new Error('La duración en días es requerida');
        if (precio === undefined || precio === null) throw new Error('El precio es requerido');
        if (!estado?.trim()) throw new Error('El estado es requerido');
    }

    getTiposMembresiaCliente = async (req, res) => {
        try {
            const sucursalId = this.obtenerSucursalId(req);
            if (sucursalId === 'todas') {
                return res.status(400).json(new ResponseModel(
                    null,
                    1,
                    'Selecciona una sucursal específica para consultar membresías de venta',
                    400
                ));
            }
            const disponibles = await this.dao.obtenerDisponiblesParaVenta(
                this.obtenerEmpresaId(req),
                sucursalId
            );
            return this.respuestaExito(res, disponibles, 'Planes de membresía disponibles cargados con éxito');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };
}

export const tipoMembresiaController = new TipoMembresiaController();