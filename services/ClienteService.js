import { prisma } from '../dao/BaseDao.js';
import { clienteDao } from '../dao/ClienteDao.js';
import { tokenDao } from '../dao/TokenDao.js';
import { usuarioDao } from '../dao/UsuarioDao.js';
import { verificarContrasena } from '../utilidades/utilesSeguridad.js';

export class ClienteService {

    constructor() {
        this.dao = clienteDao;
    }

    verificarCredenciales = async (data) => {
        const { email, contrasenia } = data;

        const usuario = await usuarioDao.getByCredenciales(email, contrasenia);

        if (!usuario) {
            throw new Error("Usuario Inexistente");
        }

        const cliente = await this.dao.getByUser(usuario.id);

        if (!cliente) {
            throw new Error("Credenciales inválidas");
        }

        const token = await tokenDao.crearTokenSesion(usuario.id);

        return {
            usuario,
            token
        };
    };

    verificarCorreo = async (data) => {
        const { correo } = data;
        const usuario = await usuarioDao.getByEmail(correo);
        return { usuario };
    };

    crear = async (datos) => {
        const {
            usuarioId, estadoClienteId, nombre, apellidoPaterno,
            apellidoMaterno, fechaNacimiento, genero, telefono,
            correo, direccion, contactoEmergenciaNombre,
            contactoEmergenciaTelefono
        } = datos;

        this.validar({
            estadoClienteId, nombre, apellidoPaterno,
            fechaNacimiento, genero, telefono
        });

        return await this.dao.create({
            usuarioId: usuarioId ? Number(usuarioId) : null,
            estadoClienteId: Number(estadoClienteId),
            nombre: nombre.trim(),
            apellidoPaterno: apellidoPaterno.trim(),
            apellidoMaterno: apellidoMaterno?.trim() || null,
            fechaNacimiento: new Date(fechaNacimiento),
            genero: genero.trim(),
            telefono: telefono.trim(),
            correo: correo?.trim() || null,
            direccion: direccion?.trim() || null,
            contactoEmergenciaNombre: contactoEmergenciaNombre?.trim() || null,
            contactoEmergenciaTelefono: contactoEmergenciaTelefono?.trim() || null,
            fechaRegistro: new Date()
        });
    };

    actualizar = async (id, datos) => {
        const {
            estadoClienteId, nombre, apellidoPaterno,
            apellidoMaterno, fechaNacimiento, genero, telefono,
            correo, direccion, contactoEmergenciaNombre,
            contactoEmergenciaTelefono
        } = datos;

        this.validar({
            estadoClienteId, nombre, apellidoPaterno,
            fechaNacimiento, genero, telefono
        });

        return await this.dao.update(Number(id), {
            estadoClienteId: Number(estadoClienteId),
            nombre: nombre.trim(),
            apellidoPaterno: apellidoPaterno.trim(),
            apellidoMaterno: apellidoMaterno?.trim() || null,
            fechaNacimiento: new Date(fechaNacimiento),
            genero: genero.trim(),
            telefono: telefono.trim(),
            correo: correo?.trim() || null,
            direccion: direccion?.trim() || null,
            contactoEmergenciaNombre: contactoEmergenciaNombre?.trim() || null,
            contactoEmergenciaTelefono: contactoEmergenciaTelefono?.trim() || null
        });
    };

    eliminar = async (id) => {
        return await this.dao.delete(Number(id));
    };

    obtenerMiPerfil = async (usuarioId) => {
        const idUsuario = Number(usuarioId);
        if (!idUsuario || isNaN(idUsuario)) {
            throw new Error('Usuario no autenticado');
        }

        const usuario = await usuarioDao.getById(idUsuario);
        if (!usuario) {
            throw new Error('El usuario no existe o no está activo');
        }

        const cliente = await this.dao.getByUser(idUsuario);
        if (!cliente) {
            throw new Error('No se encontró el perfil de cliente asociado a esta cuenta');
        }

        return {
            usuario,
            cliente
        };
    };

    actualizarMiPerfil = async (usuarioId, datos) => {
        const idUsuario = Number(usuarioId);
        if (!idUsuario || isNaN(idUsuario)) {
            throw new Error('Usuario no autenticado');
        }

        const usuarioActual = await prisma.usuario.findFirst({
            where: {
                id: idUsuario,
                deletedAt: null
            }
        });
        if (!usuarioActual) {
            throw new Error('El usuario no existe o no está activo');
        }

        const clienteActual = await this.dao.getByUser(idUsuario);
        if (!clienteActual) {
            throw new Error('No se encontró el perfil de cliente asociado a esta cuenta');
        }

        const {
            usuario,
            email,
            contraseniaActual,
            nuevaContrasenia,
            fotoUrl,
            nombre,
            apellidoPaterno,
            apellidoMaterno,
            fechaNacimiento,
            genero,
            telefono,
            direccion,
            contactoEmergenciaNombre,
            contactoEmergenciaTelefono
        } = datos;

        const nombreUsuarioLimpio = usuario !== undefined ? String(usuario).trim() : usuarioActual.nombre;
        const emailLimpio = email !== undefined ? String(email).trim() : usuarioActual.email;

        if (!nombreUsuarioLimpio || nombreUsuarioLimpio.length < 3) {
            throw new Error('El nombre de usuario debe tener al menos 3 caracteres');
        }

        const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailLimpio || !regexEmail.test(emailLimpio)) {
            throw new Error('El correo electrónico no tiene un formato válido');
        }

        if (emailLimpio.toLowerCase() !== usuarioActual.email.toLowerCase()) {
            const usuarioConCorreo = await usuarioDao.getByEmail(emailLimpio);
            if (usuarioConCorreo && usuarioConCorreo.id !== idUsuario) {
                throw new Error('El correo electrónico ya está en uso por otra cuenta');
            }
        }

        let contraseniaParaActualizar = undefined;
        if (nuevaContrasenia && String(nuevaContrasenia).trim() !== '') {
            if (!contraseniaActual || String(contraseniaActual).trim() === '') {
                throw new Error('Debes ingresar tu contraseña actual para poder cambiarla');
            }
            const esActualValida = verificarContrasena(String(contraseniaActual), usuarioActual.contrasenia);
            if (!esActualValida) {
                throw new Error('La contraseña actual es incorrecta');
            }
            if (String(nuevaContrasenia).length < 8) {
                throw new Error('La nueva contraseña debe tener al menos 8 caracteres');
            }
            contraseniaParaActualizar = String(nuevaContrasenia);
        }

        const estadoClienteIdSeguro = clienteActual.estadoClienteId;

        this.validar({
            estadoClienteId: estadoClienteIdSeguro,
            nombre,
            apellidoPaterno,
            fechaNacimiento,
            genero,
            telefono
        });

        const usuarioActualizado = await usuarioDao.update(idUsuario, {
            nombre: nombreUsuarioLimpio,
            email: emailLimpio,
            ...(contraseniaParaActualizar ? { contrasenia: contraseniaParaActualizar } : {}),
            ...(fotoUrl !== undefined ? { fotoUrl } : {})
        });

        await this.dao.update(clienteActual.id, {
            estadoClienteId: Number(estadoClienteIdSeguro),
            nombre: String(nombre).trim(),
            apellidoPaterno: String(apellidoPaterno).trim(),
            apellidoMaterno: apellidoMaterno?.trim() || null,
            fechaNacimiento: new Date(fechaNacimiento),
            genero: String(genero).trim(),
            telefono: String(telefono).trim(),
            correo: emailLimpio,
            direccion: direccion?.trim() || null,
            contactoEmergenciaNombre: contactoEmergenciaNombre?.trim() || null,
            contactoEmergenciaTelefono: contactoEmergenciaTelefono?.trim() || null
        });

        const clienteActualizado = await this.dao.getByUser(idUsuario);

        return {
            usuario: usuarioActualizado,
            cliente: clienteActualizado
        };
    };

    validar({ estadoClienteId, nombre, apellidoPaterno, fechaNacimiento, genero, telefono }) {
        if (!estadoClienteId) throw new Error('El estado de cliente es requerido');
        if (!nombre?.trim()) throw new Error('El nombre es requerido');
        if (!apellidoPaterno?.trim()) throw new Error('El apellido paterno es requerido');
        if (!fechaNacimiento) throw new Error('La fecha de nacimiento es requerida');
        if (!genero?.trim()) throw new Error('El género es requerido');
        if (!telefono?.trim()) throw new Error('El teléfono es requerido');
    }
}

export const clienteService = new ClienteService();
