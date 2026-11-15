import { prisma } from '../dao/BaseDao.js';
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

            // 1. Obtener el rol de Cliente (o crearlo si no existe aún en la tabla roles)
            let rolCliente = await prisma.rol.findFirst({
                where: {
                    OR: [{ id: 2 }, { nombre: 'Cliente' }],
                    deletedAt: null
                }
            });
            if (!rolCliente) {
                rolCliente = await prisma.rol.upsert({
                    where: { nombre: 'Cliente' },
                    update: { deletedAt: null },
                    create: {
                        nombre: 'Cliente',
                        descripcion: 'Acceso para clientes del gimnasio'
                    }
                });
            }

            // 2. Obtener el EstadoCliente "Activo" (o el primero disponible en estados_clientes)
            let estadoActivo = await prisma.estadoCliente.findFirst({
                where: {
                    deletedAt: null
                },
                orderBy: { id: 'asc' }
            });
            if (!estadoActivo) {
                estadoActivo = await prisma.estadoCliente.create({
                    data: {
                        nombre: 'Activo',
                        descripcion: 'Cliente activo en el sistema'
                    }
                });
            }

            const usuarioData = {
                nombre: usuario,
                email,
                contrasenia,
                rolId: rolCliente.id,
                fotoUrl
            };

            const nuevoUsuario = await usuarioService.registrarUsuario(usuarioData);

            const clienteData = {
                usuarioId: nuevoUsuario.id,
                estadoClienteId: estadoActivo.id,
                nombre, apellidoPaterno, apellidoMaterno,
                fechaNacimiento, genero, telefono,
                correo: email,
                direccion, contactoEmergenciaNombre,
                contactoEmergenciaTelefono
            };

            await clienteService.crear(clienteData);

            const token = await tokenDao.crearTokenSesion(nuevoUsuario.id);

            const opcionesCookies = {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: token.registro.tiempoVida * 1000
            };

            res.cookie('token', token.token, opcionesCookies);

            return this.respuestaExito(
                res,
                {
                    nuevoUsuario
                },
                "Registro Exitoso"
            );
        } catch (error) {
            return this.respuestaError(res, error);
        }
    }

    verificarCredenciales = async (req, res) => {
        try {
            const { usuario, token } = await clienteService.verificarCredenciales(req.body);
            if (!usuario) {
                throw new Error("Credenciales inválidas");
            }

            const opcionesCookies = {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: token.registro.tiempoVida * 1000
            };

            res.cookie('token', token.token, opcionesCookies);
            return this.respuestaExito(
                res,
                {
                    usuario
                },
                "Credenciales válidas"
            );
        } catch (error) {
            return this.respuestaError(res, error);
        }
    }

    verificarCorreo = async (req, res) => {
        try {
            const { usuario } = await clienteService.verificarCorreo(req.body);
            return this.respuestaExito(
                res,
                {
                    usuario
                }
            );
        } catch (error) {
            return this.respuestaError(res, error);
        }
    }

    obtenerMiPerfil = async (req, res) => {
        try {
            const usuarioId = req.usuario?.id;
            if (!usuarioId) {
                throw new Error('Usuario no autenticado');
            }
            const perfil = await clienteService.obtenerMiPerfil(usuarioId);
            return this.respuestaExito(res, perfil, 'Perfil obtenido correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    actualizarMiPerfil = async (req, res) => {
        try {
            const usuarioId = req.usuario?.id;
            if (!usuarioId) {
                throw new Error('Usuario no autenticado');
            }
            const perfilActualizado = await clienteService.actualizarMiPerfil(usuarioId, req.body);
            return this.respuestaExito(res, perfilActualizado, 'Perfil actualizado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };
}

export const clienteController = new ClienteController();
