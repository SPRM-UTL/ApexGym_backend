import { sucursalDao } from '../dao/SucursalDao.js';
import { BaseController } from './BaseController.js';

export class SucursalController extends BaseController {
    constructor() {
        super(sucursalDao);
    }

    obtenerActual = async (req, res) => {
        try {
            const empresaId = this.obtenerEmpresaId(req);
            const sucursalId = req.headers['x-sucursal-id'] ?? req.query.sucursalId ?? 1;
            const sucursal = await this.dao.obtenerActual(Number(sucursalId), empresaId);
            if (!sucursal) {
                return this.respuestaNoEncontrado(res, 'Sucursal no encontrada');
            }
            return this.respuestaExito(res, sucursal, 'Datos de la sucursal obtenidos correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    crear = async (req, res) => {
        try {
            const empresaId = this.obtenerEmpresaId(req);
            const payload = this.normalizarYValidar(req.body);
            payload.empresaId = empresaId;

            const nueva = await this.dao.create(payload, empresaId);
            return res.status(201).json({
                data: nueva,
                status: 0,
                mensaje: 'Sucursal registrada correctamente',
                code: 201,
            });
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    actualizar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (isNaN(id) || id <= 0) {
                throw new Error('ID de sucursal no válido');
            }

            const empresaId = this.obtenerEmpresaId(req);
            const payload = this.normalizarYValidar(req.body, true);

            const actualizada = await this.dao.update(id, payload, empresaId);
            return this.respuestaExito(res, actualizada, 'Sucursal actualizada correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    eliminar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (isNaN(id) || id <= 0) {
                throw new Error('ID de sucursal no válido');
            }

            if (id === 1) {
                throw new Error('No es posible eliminar la sucursal principal o matriz (id=1)');
            }

            await this.dao.delete(id);
            return this.respuestaExito(res, null, 'Sucursal eliminada correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    normalizarYValidar(body = {}, esActualizacion = false) {
        const nombre = String(body.nombre ?? '').trim();
        if (!nombre && !esActualizacion) {
            throw new Error('El nombre de la sucursal es obligatorio');
        }
        if (nombre && nombre.length > 100) {
            throw new Error('El nombre de la sucursal no puede exceder 100 caracteres');
        }

        const codigo = body.codigo ? String(body.codigo).trim().toUpperCase() : null;
        if (codigo && codigo.length > 20) {
            throw new Error('El código de sucursal no puede exceder 20 caracteres');
        }

        const direccion = body.direccion ? String(body.direccion).trim() : null;
        if (direccion && direccion.length > 255) {
            throw new Error('La dirección no puede exceder 255 caracteres');
        }

        const ciudad = body.ciudad ? String(body.ciudad).trim() : null;
        if (ciudad && ciudad.length > 100) {
            throw new Error('La ciudad no puede exceder 100 caracteres');
        }

        const estado = body.estado ? String(body.estado).trim() : null;
        if (estado && estado.length > 100) {
            throw new Error('El estado no puede exceder 100 caracteres');
        }

        const codigoPostal = body.codigoPostal ? String(body.codigoPostal).trim() : null;
        if (codigoPostal && codigoPostal.length > 10) {
            throw new Error('El código postal no puede exceder 10 caracteres');
        }

        const telefono = body.telefono ? String(body.telefono).trim() : null;
        if (telefono && telefono.length > 30) {
            throw new Error('El teléfono no puede exceder 30 caracteres');
        }

        const email = body.email ? String(body.email).trim() : null;
        if (email && email.length > 191) {
            throw new Error('El correo electrónico no puede exceder 191 caracteres');
        }

        const activo = body.activo !== undefined ? Boolean(body.activo) : true;

        const resultado = {
            ...(nombre ? { nombre } : {}),
            codigo,
            direccion,
            ciudad,
            estado,
            codigoPostal,
            telefono,
            email,
            activo,
        };

        return resultado;
    }
}

export const sucursalController = new SucursalController();
