import { clienteDao } from '../dao/ClienteDao.js';
import { usuarioDao } from '../dao/UsuarioDao.js';

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