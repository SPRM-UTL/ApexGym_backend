import { empleadoDao } from '../dao/EmpleadoDao.js';
import { BaseController } from './BaseController.js';
import { guardarImagenServidor } from '../utilidades/guardarImagen.js';

export class EmpleadoController extends BaseController {
    constructor() {
        super(empleadoDao);
    }

    crear = async (req, res) => {
        try {
            const {
                puestoId,
                areaTrabajoId,
                estadoEmpleadoId,
                usuarioId,
                nombre,
                apellidoPaterno,
                apellidoMaterno,
                telefono,
                correo,
                direccion,
                fechaNacimiento,
                fechaIngreso,
                imagenUrl,
                imagenPublicId,
            } = req.body;

            this.validar({
                puestoId,
                areaTrabajoId,
                estadoEmpleadoId,
                nombre,
                apellidoPaterno,
                apellidoMaterno,
                telefono,
                correo,
                direccion,
                fechaNacimiento,
                fechaIngreso,
            });

            // Si se envió imagen base64, se guarda como archivo físico en /public/imagenes/empleados/
            const rutaImagen = imagenUrl ? guardarImagenServidor(imagenUrl, 'empleados') : null;

            const registro = await this.dao.create({
                puestoId: Number(puestoId),
                areaTrabajoId: Number(areaTrabajoId),
                estadoEmpleadoId: Number(estadoEmpleadoId),
                usuarioId: usuarioId ? Number(usuarioId) : null,
                nombre: nombre.trim(),
                apellidoPaterno: apellidoPaterno.trim(),
                apellidoMaterno: apellidoMaterno ? apellidoMaterno.trim() : null,
                telefono: telefono.trim(),
                correo: correo ? correo.trim() : null,
                direccion: direccion ? direccion.trim() : null,
                fechaNacimiento: new Date(fechaNacimiento),
                fechaIngreso: new Date(fechaIngreso),
                imagenUrl: rutaImagen,
                imagenPublicId: imagenPublicId ? imagenPublicId.trim() : null,
            });

            return this.respuestaExito(res, registro, 'Empleado creado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    actualizar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) throw new Error('ID no válido');

            const {
                puestoId,
                areaTrabajoId,
                estadoEmpleadoId,
                usuarioId,
                nombre,
                apellidoPaterno,
                apellidoMaterno,
                telefono,
                correo,
                direccion,
                fechaNacimiento,
                fechaIngreso,
                imagenUrl,
                imagenPublicId,
            } = req.body;

            this.validar({
                puestoId,
                areaTrabajoId,
                estadoEmpleadoId,
                nombre,
                apellidoPaterno,
                apellidoMaterno,
                telefono,
                correo,
                direccion,
                fechaNacimiento,
                fechaIngreso,
            });

            // Si se envió imagen base64, se guarda como archivo físico en /public/imagenes/empleados/
            const rutaImagen = imagenUrl !== undefined ? guardarImagenServidor(imagenUrl, 'empleados') : undefined;

            const registro = await this.dao.update(id, {
                puestoId: Number(puestoId),
                areaTrabajoId: Number(areaTrabajoId),
                estadoEmpleadoId: Number(estadoEmpleadoId),
                usuarioId: usuarioId ? Number(usuarioId) : null,
                nombre: nombre.trim(),
                apellidoPaterno: apellidoPaterno.trim(),
                apellidoMaterno: apellidoMaterno ? apellidoMaterno.trim() : null,
                telefono: telefono.trim(),
                correo: correo ? correo.trim() : null,
                direccion: direccion ? direccion.trim() : null,
                fechaNacimiento: new Date(fechaNacimiento),
                fechaIngreso: new Date(fechaIngreso),
                imagenUrl: rutaImagen,
                imagenPublicId: imagenPublicId ? imagenPublicId.trim() : null,
            });

            return this.respuestaExito(res, registro, 'Empleado actualizado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    eliminar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) throw new Error('ID no válido');
            const registro = await this.dao.delete(id);
            return this.respuestaExito(res, registro, 'Empleado eliminado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    validar({
        puestoId,
        areaTrabajoId,
        estadoEmpleadoId,
        nombre,
        apellidoPaterno,
        apellidoMaterno,
        telefono,
        correo,
        direccion,
        fechaNacimiento,
        fechaIngreso,
    }) {
        if (!puestoId || isNaN(Number(puestoId))) throw new Error('El puesto es requerido');
        if (!areaTrabajoId || isNaN(Number(areaTrabajoId))) throw new Error('El área de trabajo es requerida');
        if (!estadoEmpleadoId || isNaN(Number(estadoEmpleadoId))) throw new Error('El estado de empleado es requerido');
        if (!nombre?.trim()) throw new Error('El nombre del empleado es requerido');
        if (nombre.trim().length > 100) throw new Error('El nombre no puede exceder 100 caracteres');
        if (!apellidoPaterno?.trim()) throw new Error('El apellido paterno es requerido');
        if (apellidoPaterno.trim().length > 100) throw new Error('El apellido paterno no puede exceder 100 caracteres');
        if (apellidoMaterno && apellidoMaterno.trim().length > 100) throw new Error('El apellido materno no puede exceder 100 caracteres');

        if (!telefono?.trim()) throw new Error('El teléfono es requerido');
        const telLimpio = telefono.trim().replace(/\s+/g, '');
        if (!/^\d{10}$/.test(telLimpio)) throw new Error('El teléfono debe tener exactamente 10 dígitos numéricos');

        if (correo && correo.trim()) {
            if (correo.trim().length > 191) throw new Error('El correo electrónico no puede exceder 191 caracteres');
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(correo.trim())) throw new Error('El formato del correo electrónico no es válido');
        }

        if (direccion && direccion.trim().length > 500) throw new Error('La dirección no puede exceder 500 caracteres');

        if (!fechaNacimiento || isNaN(Date.parse(fechaNacimiento))) throw new Error('La fecha de nacimiento es requerida y debe ser válida');

        const fechaNac = new Date(fechaNacimiento);
        const hoy = new Date();
        let edad = hoy.getFullYear() - fechaNac.getFullYear();
        const m = hoy.getMonth() - fechaNac.getMonth();
        if (m < 0 || (m === 0 && hoy.getDate() < fechaNac.getDate())) {
            edad--;
        }
        if (edad < 18) {
            throw new Error('El empleado debe ser mayor de edad (mínimo 18 años)');
        }

        if (!fechaIngreso || isNaN(Date.parse(fechaIngreso))) throw new Error('La fecha de ingreso es requerida y debe ser válida');
    }
}

export const empleadoController = new EmpleadoController();
