import { clienteDao } from '../dao/ClienteDao.js';
import { tokenDao } from '../dao/TokenDao.js';
import { clienteService } from '../services/ClienteService.js';
import { usuarioService } from '../services/UsuarioService.js';
import { BaseController } from './BaseController.js';

export class ClienteController extends BaseController {
    constructor() {
        super(clienteDao);
    }

    crear = async (req, res) => {
        try {
            const registro = await clienteService.crear(req.body);

            return this.respuestaExito(res, registro, 'Cliente creado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    actualizar = async (req, res) => {
        try {
            const registro = await clienteService.actualizar(req.params.id, req.body);

            return this.respuestaExito(res, registro, 'Cliente actualizado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    eliminar = async (req, res) => {
        try {
            const registro = await clienteService.eliminar(req.params.id);
            return this.respuestaExito(res, registro, 'Cliente eliminado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    registrar = async (req, res) => {
        try {
            const {
                //Datos de usuario
                usuario, email, contrasenia, fotoUrl,
                //Datos del cliente
                nombre, apellidoPaterno, apellidoMaterno,
                fechaNacimiento, genero, telefono,
                direccion, contactoEmergenciaNombre,
                contactoEmergenciaTelefono
            } = req.body;

            const usuarioData = {
                nombre: usuario,
                email,
                contrasenia,
                rolId: 2,
                fotoUrl
            }

            const nuevoUsuario = await usuarioService.registrarUsuario(usuarioData);

            const clienteData = {
                usuarioId: nuevoUsuario.id,
                estadoClienteId: 1,
                nombre, apellidoPaterno, apellidoMaterno,
                fechaNacimiento, genero, telefono,
                correo: email,
                direccion, contactoEmergenciaNombre,
                contactoEmergenciaTelefono
            }

            await clienteService.crear(clienteData);

            const token = await tokenDao.crearTokenSesion(nuevoUsuario.id);

            const opcionesCookies = {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: token.registro.tiempoVida * 1000
            }

            res.cookie('token', token.token, opcionesCookies)

            return this.respuestaExito(

                res,
                {
                    nuevoUsuario
                },
                "Credenciales válidas"
            );
        } catch (error) {
            return this.respuestaError(res, error);
        }
    }
}

export const clienteController = new ClienteController();
