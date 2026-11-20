import { prisma } from '../dao/BaseDao.js';
import { clienteDao } from '../dao/ClienteDao.js';
import { clienteService } from '../services/ClienteService.js';
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

    buscarPorNombreOId = async (req, res) => {
        try {
            const termino = typeof req.query.q === 'string' ? req.query.q.trim() : '';
            const esId = /^\d+$/.test(termino);
            const pagina = Number(req.query.pagina ?? 1);
            const limiteSolicitado = Number(req.query.limite ?? 20);

            if (!termino || (termino.length < 2 && !esId)) {
                return this.respuestaExito(res, {
                    registros: [],
                    total: 0,
                    pagina: Number.isInteger(pagina) && pagina > 0 ? pagina : 1,
                    limite: 20,
                }, 'Ingresa al menos 2 caracteres o un ID válido');
            }
            if (!Number.isInteger(pagina) || pagina < 1) {
                throw new Error('La página debe ser un entero mayor que cero');
            }
            if (!Number.isInteger(limiteSolicitado) || limiteSolicitado < 1) {
                throw new Error('El límite debe ser un entero mayor que cero');
            }

            const limite = Math.min(limiteSolicitado, 50);
            const resultado = await clienteDao.buscarPorNombreOId(termino, { pagina, limite });
            return this.respuestaExito(res, resultado, 'Clientes encontrados');
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