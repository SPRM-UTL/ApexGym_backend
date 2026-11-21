import { empleadoDao } from '../dao/EmpleadoDao.js';
import { BaseController } from './BaseController.js';
import { guardarImagenServidor } from '../utils/guardarImagen.js';
import { obtenerImagen } from '../middleware/uploadMiddleware.js';

const limpiarOpcional = (valor) => {
    if (valor === undefined || valor === null) return null;
    const texto = String(valor).trim();
    return texto.length > 0 ? texto : null;
};

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
                calle,
                numeroExterior,
                numeroInterior,
                colonia,
                codigoPostal,
                municipio,
                estado,
                entreCalles,
                fechaNacimiento,
                fechaIngreso,
                imagenUrl,
                imagenPublicId,
            } = req.body ?? {};

            this.validar({
                puestoId,
                areaTrabajoId,
                estadoEmpleadoId,
                nombre,
                apellidoPaterno,
                apellidoMaterno,
                telefono,
                correo,
                calle,
                numeroExterior,
                numeroInterior,
                colonia,
                codigoPostal,
                municipio,
                estado,
                entreCalles,
                fechaNacimiento,
                fechaIngreso,
            });

            // Si se envió imagen base64, se guarda como archivo físico en /public/imagenes/empleados/
            const imagenSubida = req.file ? obtenerImagen('empleados', req.file) : null;
            const rutaImagen = imagenSubida?.url
                ?? (imagenUrl ? guardarImagenServidor(imagenUrl, 'empleados') : null);
            const publicIdImagen = imagenSubida?.publicId ?? (imagenPublicId || null);

            const registro = await this.dao.create({
                puestoId: Number(puestoId),
                areaTrabajoId: Number(areaTrabajoId),
                estadoEmpleadoId: Number(estadoEmpleadoId),
                usuarioId: usuarioId ? Number(usuarioId) : null,
                nombre: nombre.trim(),
                apellidoPaterno: apellidoPaterno.trim(),
                apellidoMaterno: limpiarOpcional(apellidoMaterno),
                telefono: telefono.trim(),
                correo: limpiarOpcional(correo),
                calle: limpiarOpcional(calle),
                numeroExterior: limpiarOpcional(numeroExterior),
                numeroInterior: limpiarOpcional(numeroInterior),
                colonia: limpiarOpcional(colonia),
                codigoPostal: limpiarOpcional(codigoPostal),
                municipio: limpiarOpcional(municipio),
                estado: limpiarOpcional(estado),
                entreCalles: limpiarOpcional(entreCalles),
                fechaNacimiento: new Date(fechaNacimiento),
                fechaIngreso: new Date(fechaIngreso),
                imagenUrl: rutaImagen,
                imagenPublicId: limpiarOpcional(publicIdImagen),
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
                calle,
                numeroExterior,
                numeroInterior,
                colonia,
                codigoPostal,
                municipio,
                estado,
                entreCalles,
                fechaNacimiento,
                fechaIngreso,
                imagenUrl,
                imagenPublicId,
            } = req.body ?? {};

            this.validar({
                puestoId,
                areaTrabajoId,
                estadoEmpleadoId,
                nombre,
                apellidoPaterno,
                apellidoMaterno,
                telefono,
                correo,
                calle,
                numeroExterior,
                numeroInterior,
                colonia,
                codigoPostal,
                municipio,
                estado,
                entreCalles,
                fechaNacimiento,
                fechaIngreso,
            });

            // Si se envió imagen base64, se guarda como archivo físico en /public/imagenes/empleados/
            const imagenSubida = req.file ? obtenerImagen('empleados', req.file) : null;
            const rutaImagen = imagenSubida?.url
                ?? (imagenUrl ? guardarImagenServidor(imagenUrl, 'empleados') : undefined);
            const publicIdImagen = imagenSubida?.publicId ?? (imagenPublicId || undefined);

            const registro = await this.dao.update(id, {
                puestoId: Number(puestoId),
                areaTrabajoId: Number(areaTrabajoId),
                estadoEmpleadoId: Number(estadoEmpleadoId),
                usuarioId: usuarioId ? Number(usuarioId) : null,
                nombre: nombre.trim(),
                apellidoPaterno: apellidoPaterno.trim(),
                apellidoMaterno: limpiarOpcional(apellidoMaterno),
                telefono: telefono.trim(),
                correo: limpiarOpcional(correo),
                calle: limpiarOpcional(calle),
                numeroExterior: limpiarOpcional(numeroExterior),
                numeroInterior: limpiarOpcional(numeroInterior),
                colonia: limpiarOpcional(colonia),
                codigoPostal: limpiarOpcional(codigoPostal),
                municipio: limpiarOpcional(municipio),
                estado: limpiarOpcional(estado),
                entreCalles: limpiarOpcional(entreCalles),
                fechaNacimiento: new Date(fechaNacimiento),
                fechaIngreso: new Date(fechaIngreso),
                ...(rutaImagen !== undefined && { imagenUrl: rutaImagen }),
                ...(publicIdImagen !== undefined && {
                    imagenPublicId: limpiarOpcional(publicIdImagen),
                }),
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
        calle,
        numeroExterior,
        numeroInterior,
        colonia,
        codigoPostal,
        municipio,
        estado,
        entreCalles,
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

        if (calle && String(calle).trim().length > 150) throw new Error('La calle no puede exceder 150 caracteres');
        if (numeroExterior && String(numeroExterior).trim().length > 20) throw new Error('El número exterior no puede exceder 20 caracteres');
        if (numeroInterior && String(numeroInterior).trim().length > 20) throw new Error('El número interior no puede exceder 20 caracteres');
        if (colonia && String(colonia).trim().length > 100) throw new Error('La colonia no puede exceder 100 caracteres');
        if (codigoPostal && String(codigoPostal).trim().length > 10) throw new Error('El código postal no puede exceder 10 caracteres');
        if (municipio && String(municipio).trim().length > 100) throw new Error('El municipio no puede exceder 100 caracteres');
        if (estado && String(estado).trim().length > 100) throw new Error('El estado no puede exceder 100 caracteres');
        if (entreCalles && String(entreCalles).trim().length > 200) throw new Error('Entre calles no puede exceder 200 caracteres');

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
