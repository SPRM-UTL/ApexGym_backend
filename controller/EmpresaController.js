import { empresaDao } from '../dao/EmpresaDao.js';
import { BaseController } from './BaseController.js';

export class EmpresaController extends BaseController {
    constructor() {
        super(empresaDao);
    }

    obtenerActual = async (req, res) => {
        try {
            const empresaId = this.obtenerEmpresaId(req);
            const empresa = await this.dao.obtenerActual(empresaId);
            if (!empresa) {
                return this.respuestaNoEncontrado(res, 'Empresa no encontrada');
            }
            return this.respuestaExito(res, empresa, 'Datos de la empresa obtenidos correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    actualizarActual = async (req, res) => {
        try {
            const empresaId = req.params.id ? Number(req.params.id) : this.obtenerEmpresaId(req);
            if (isNaN(empresaId) || empresaId <= 0) {
                throw new Error('ID de empresa no válido');
            }

            const payload = this.normalizarYValidar(req.body);
            const actualizada = await this.dao.actualizarActual(empresaId, payload);

            return this.respuestaExito(res, actualizada, 'Configuración de la empresa actualizada correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    normalizarYValidar(body = {}) {
        const nombreComercial = String(body.nombreComercial ?? '').trim();
        if (!nombreComercial) {
            throw new Error('El nombre comercial de la empresa es obligatorio');
        }
        if (nombreComercial.length > 150) {
            throw new Error('El nombre comercial no puede exceder 150 caracteres');
        }

        const razonSocial = body.razonSocial ? String(body.razonSocial).trim() : null;
        if (razonSocial && razonSocial.length > 200) {
            throw new Error('La razón social no puede exceder 200 caracteres');
        }

        const rfc = body.rfc ? String(body.rfc).trim().toUpperCase() : null;
        if (rfc && rfc.length > 20) {
            throw new Error('El RFC no puede exceder 20 caracteres');
        }

        const telefono = body.telefono ? String(body.telefono).trim() : null;
        if (telefono && telefono.length > 30) {
            throw new Error('El teléfono no puede exceder 30 caracteres');
        }

        const email = body.email ? String(body.email).trim() : null;
        if (email && email.length > 191) {
            throw new Error('El correo electrónico no puede exceder 191 caracteres');
        }

        const direccion = body.direccion ? String(body.direccion).trim() : null;
        const ciudad = body.ciudad ? String(body.ciudad).trim() : null;
        const estado = body.estado ? String(body.estado).trim() : null;
        const codigoPostal = body.codigoPostal ? String(body.codigoPostal).trim() : null;
        const logoUrl = body.logoUrl !== undefined ? (body.logoUrl ? String(body.logoUrl).trim() : null) : undefined;

        const colorPrimario = body.colorPrimario ? String(body.colorPrimario).trim() : '#FF6A00';
        const moneda = body.moneda ? String(body.moneda).trim().toUpperCase() : 'MXN';
        const simboloMoneda = body.simboloMoneda ? String(body.simboloMoneda).trim() : '$';
        const zonaHoraria = body.zonaHoraria ? String(body.zonaHoraria).trim() : 'America/Mexico_City';

        const toleranciaMinutos =
            body.toleranciaMinutos !== undefined && body.toleranciaMinutos !== ''
                ? Number(body.toleranciaMinutos)
                : 15;
        if (isNaN(toleranciaMinutos) || toleranciaMinutos < 0 || toleranciaMinutos > 240) {
            throw new Error('La tolerancia en minutos debe estar entre 0 y 240');
        }

        const mensajeTicket = body.mensajeTicket !== undefined
            ? (body.mensajeTicket ? String(body.mensajeTicket).trim() : null)
            : undefined;

        const activo = body.activo !== undefined ? Boolean(body.activo) : true;

        return {
            nombreComercial,
            razonSocial,
            rfc,
            telefono,
            email,
            direccion,
            ciudad,
            estado,
            codigoPostal,
            ...(logoUrl !== undefined ? { logoUrl } : {}),
            colorPrimario,
            moneda,
            simboloMoneda,
            zonaHoraria,
            toleranciaMinutos: Math.round(toleranciaMinutos),
            ...(mensajeTicket !== undefined ? { mensajeTicket } : {}),
            activo,
        };
    }
}

export const empresaController = new EmpresaController();
