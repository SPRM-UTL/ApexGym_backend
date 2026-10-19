import { clienteDao } from '../dao/ClienteDao.js';
import { BaseController } from './BaseController.js';

export class ClienteController extends BaseController {
    constructor() {
        super(clienteDao);
    }

    crear = async (req, res) => {
        try {
            const {
                estadoClienteId, nombre, apellidoPaterno, apellidoMaterno, 
                fechaNacimiento, genero, telefono, correo, direccion, 
                contactoEmergenciaNombre, contactoEmergenciaTelefono
            } = req.body;
            
            this.validar({ estadoClienteId, nombre, apellidoPaterno, fechaNacimiento, genero, telefono });
            
            const registro = await this.dao.create({
                estadoClienteId: Number(estadoClienteId),
                nombre: nombre.trim(),
                apellidoPaterno: apellidoPaterno.trim(),
                apellidoMaterno: apellidoMaterno ? apellidoMaterno.trim() : null,
                fechaNacimiento: new Date(fechaNacimiento),
                genero: genero.trim(),
                telefono: telefono.trim(),
                correo: correo ? correo.trim() : null,
                direccion: direccion ? direccion.trim() : null,
                contactoEmergenciaNombre: contactoEmergenciaNombre ? contactoEmergenciaNombre.trim() : null,
                contactoEmergenciaTelefono: contactoEmergenciaTelefono ? contactoEmergenciaTelefono.trim() : null,
                fechaRegistro: new Date()
            });
            
            return this.respuestaExito(res, registro, 'Cliente creado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    actualizar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            const {
                estadoClienteId, nombre, apellidoPaterno, apellidoMaterno, 
                fechaNacimiento, genero, telefono, correo, direccion, 
                contactoEmergenciaNombre, contactoEmergenciaTelefono
            } = req.body;
            
            this.validar({ estadoClienteId, nombre, apellidoPaterno, fechaNacimiento, genero, telefono });
            
            const registro = await this.dao.update(id, {
                estadoClienteId: Number(estadoClienteId),
                nombre: nombre.trim(),
                apellidoPaterno: apellidoPaterno.trim(),
                apellidoMaterno: apellidoMaterno ? apellidoMaterno.trim() : null,
                fechaNacimiento: new Date(fechaNacimiento),
                genero: genero.trim(),
                telefono: telefono.trim(),
                correo: correo ? correo.trim() : null,
                direccion: direccion ? direccion.trim() : null,
                contactoEmergenciaNombre: contactoEmergenciaNombre ? contactoEmergenciaNombre.trim() : null,
                contactoEmergenciaTelefono: contactoEmergenciaTelefono ? contactoEmergenciaTelefono.trim() : null
            });
            
            return this.respuestaExito(res, registro, 'Cliente actualizado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    eliminar = async (req, res) => {
        try {
            const registro = await this.dao.delete(Number(req.params.id));
            return this.respuestaExito(res, registro, 'Cliente eliminado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
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

export const clienteController = new ClienteController();
