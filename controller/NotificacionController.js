import { prisma } from '../dao/BaseDao.js';
import { ResponseModel } from '../modelos/ResponseModel.js';
import { enviarPushNotificacion } from '../services/notificacionesPush.js';
import { registrarClienteSse } from '../services/notificacionesStream.js';

const TIPOS_DESTINATARIO = new Set(['CLIENTE', 'EMPLEADO', 'USUARIO']);
const ESTADOS = new Set(['PENDIENTE', 'LEIDA', 'IGNORADA']);

export class NotificacionController {
    constructor({ prismaClient = prisma, enviarPush = enviarPushNotificacion } = {}) {
        this.prisma = prismaClient;
        this.enviarPush = enviarPush;
    }

    async obtenerDestinatarioAutenticado(req) {
        const usuarioId = Number(req.usuario?.id ?? req.user?.id);
        if (!Number.isSafeInteger(usuarioId) || usuarioId < 1) return null;

        const empresaId = Number(req.usuario?.empresaId ?? req.user?.empresaId ?? 1);
        const cliente = await this.prisma.cliente.findFirst({
            where: { usuarioId, empresaId, deletedAt: null },
            select: { id: true },
        });
        if (cliente) {
            return { destinatarioId: cliente.id, destinatarioTipo: 'CLIENTE', empresaId, usuarioId };
        }

        const empleado = await this.prisma.empleado.findFirst({
            where: { usuarioId, empresaId, deletedAt: null },
            select: { id: true },
        });
        if (empleado) {
            return { destinatarioId: empleado.id, destinatarioTipo: 'EMPLEADO', empresaId, usuarioId };
        }

        if (typeof this.prisma.usuarioRol?.findFirst === 'function') {
            const rolAdmin = await this.prisma.usuarioRol.findFirst({
                where: {
                    usuarioId,
                    deletedAt: null,
                    rol: {
                        deletedAt: null,
                        nombre: { not: 'Cliente' },
                    },
                },
                include: { rol: { select: { nombre: true } } },
            });
            if (rolAdmin && rolAdmin.rol?.nombre?.toLowerCase() !== 'cliente') {
                return { destinatarioId: usuarioId, destinatarioTipo: 'USUARIO', empresaId, usuarioId };
            }
        }

        return null;
    }

    responderError(res, statusCode, message) {
        return res.status(statusCode).json(new ResponseModel(null, 1, message, statusCode));
    }

    crear = async (req, res) => {
        try {
            const { titulo, mensaje, destinatarioId, destinatarioTipo, tipo = 'GENERAL', sucursalId = null } = req.body ?? {};
            const id = Number(destinatarioId);
            const sucursal = sucursalId == null ? null : Number(sucursalId);
            if (typeof titulo !== 'string' || !titulo.trim() || titulo.trim().length > 150
                || typeof mensaje !== 'string' || !mensaje.trim()
                || !Number.isSafeInteger(id) || id < 1
                || !TIPOS_DESTINATARIO.has(destinatarioTipo)
                || typeof tipo !== 'string' || !tipo.trim() || tipo.trim().length > 50
                || (sucursalId != null && (!Number.isSafeInteger(sucursal) || sucursal < 1))) {
                return this.responderError(res, 400, 'Los datos de la notificación no son válidos');
            }

            const usuarioId = Number(req.usuario?.id ?? req.user?.id);
            const empresaId = Number(req.usuario?.empresaId ?? req.user?.empresaId ?? 1);
            const remitente = await this.prisma.empleado.findFirst({
                where: {
                    usuarioId,
                    empresaId,
                    deletedAt: null,
                },
                select: { id: true },
            });

            if (!remitente) {
                const esAdmin = typeof this.prisma.usuarioRol?.findFirst === 'function'
                    ? await this.prisma.usuarioRol.findFirst({
                        where: {
                            usuarioId,
                            deletedAt: null,
                            rol: { deletedAt: null, nombre: { not: 'Cliente' } },
                        },
                        select: { rolId: true },
                    })
                    : null;
                if (!esAdmin) {
                    return this.responderError(res, 403, 'Solo los empleados o administradores pueden crear notificaciones');
                }
            }

            let existe;
            let destinatarioUsuarioId = null;
            if (destinatarioTipo === 'USUARIO') {
                existe = await this.prisma.usuario.findFirst({
                    where: { id, empresaId, deletedAt: null },
                    select: { id: true },
                });
                destinatarioUsuarioId = existe?.id ?? null;
            } else {
                const modeloDestinatario = destinatarioTipo === 'CLIENTE' ? this.prisma.cliente : this.prisma.empleado;
                existe = await modeloDestinatario.findFirst({
                    where: { id, empresaId, deletedAt: null },
                    select: { id: true, usuarioId: true },
                });
                destinatarioUsuarioId = existe?.usuarioId ?? null;
            }

            if (!existe) return this.responderError(res, 404, 'El destinatario no existe');

            const notificacion = await this.prisma.notificacion.create({
                data: {
                    empresaId,
                    titulo: titulo.trim(),
                    mensaje: mensaje.trim(),
                    tipo: tipo.trim(),
                    destinatarioId: id,
                    destinatarioTipo,
                    remitenteId: remitente?.id ?? null,
                    sucursalId: sucursal,
                },
            });
            try {
                await this.enviarPush({
                    notificacion,
                    destinatarioUsuarioId,
                    prismaClient: this.prisma,
                });
            } catch (error) {
                console.error('[Notificaciones Push Error]:', error.code ?? 'envío fallido');
            }
            return res.status(201).json(new ResponseModel(notificacion, 0, 'Notificación creada correctamente', 201));
        } catch (error) {
            console.error('[NotificacionController Error]:', error);
            return this.responderError(res, 500, 'No se pudo crear la notificación');
        }
    };

    obtenerTodos = async (req, res) => {
        try {
            const destinatario = await this.obtenerDestinatarioAutenticado(req);
            if (!destinatario) return this.responderError(res, 403, 'La cuenta no tiene un destinatario asociado');

            const { estado, tipo } = req.query;
            if ((estado !== undefined && !ESTADOS.has(estado))
                || (tipo !== undefined && (typeof tipo !== 'string' || !tipo.trim() || tipo.length > 50))) {
                return this.responderError(res, 400, 'Los filtros de notificaciones no son válidos');
            }

            const notificaciones = await this.prisma.notificacion.findMany({
                where: {
                    empresaId: destinatario.empresaId,
                    destinatarioId: destinatario.destinatarioId,
                    destinatarioTipo: destinatario.destinatarioTipo,
                    ...(estado ? { estado } : {}),
                    ...(tipo ? { tipo: tipo.trim() } : {}),
                },
                orderBy: { createdAt: 'desc' },
            });
            return res.status(200).json(new ResponseModel(notificaciones, 0, 'Notificaciones obtenidas correctamente', 200));
        } catch (error) {
            console.error('[NotificacionController Error]:', error);
            return this.responderError(res, 500, 'No se pudieron obtener las notificaciones');
        }
    };

    contarNoLeidas = async (req, res) => {
        try {
            const destinatario = await this.obtenerDestinatarioAutenticado(req);
            if (!destinatario) return this.responderError(res, 403, 'La cuenta no tiene un destinatario asociado');

            const count = await this.prisma.notificacion.count({
                where: {
                    empresaId: destinatario.empresaId,
                    destinatarioId: destinatario.destinatarioId,
                    destinatarioTipo: destinatario.destinatarioTipo,
                    estado: 'PENDIENTE',
                },
            });
            return res.status(200).json(new ResponseModel({ count }, 0, 'Contador obtenido correctamente', 200));
        } catch (error) {
            console.error('[NotificacionController Error]:', error);
            return this.responderError(res, 500, 'No se pudo obtener el contador');
        }
    };

    marcarTodasLeidas = async (req, res) => {
        try {
            const destinatario = await this.obtenerDestinatarioAutenticado(req);
            if (!destinatario) return this.responderError(res, 403, 'La cuenta no tiene un destinatario asociado');

            const resultado = await this.prisma.notificacion.updateMany({
                where: {
                    empresaId: destinatario.empresaId,
                    destinatarioId: destinatario.destinatarioId,
                    destinatarioTipo: destinatario.destinatarioTipo,
                    estado: 'PENDIENTE',
                },
                data: {
                    estado: 'LEIDA',
                    leidaAt: new Date(),
                },
            });
            return res.status(200).json(
                new ResponseModel(
                    { actualizadas: resultado.count },
                    0,
                    'Todas las notificaciones fueron marcadas como leídas',
                    200
                )
            );
        } catch (error) {
            console.error('[NotificacionController Error]:', error);
            return this.responderError(res, 500, 'No se pudieron marcar las notificaciones como leídas');
        }
    };

    stream = async (req, res) => {
        try {
            const destinatario = await this.obtenerDestinatarioAutenticado(req);
            if (!destinatario) return this.responderError(res, 403, 'La cuenta no tiene un destinatario asociado');

            registrarClienteSse(destinatario.usuarioId, req, res);
            return undefined;
        } catch (error) {
            console.error('[NotificacionController Stream Error]:', error);
            if (!res.headersSent) {
                return this.responderError(res, 500, 'No se pudo iniciar el stream de notificaciones');
            }
            return undefined;
        }
    };

    cambiarEstado = (estado) => async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!Number.isSafeInteger(id) || id < 1) return this.responderError(res, 400, 'ID de notificación no válido');
            const destinatario = await this.obtenerDestinatarioAutenticado(req);
            if (!destinatario) return this.responderError(res, 403, 'La cuenta no tiene un destinatario asociado');

            const notificacion = await this.prisma.notificacion.findFirst({
                where: { id, empresaId: destinatario.empresaId },
            });
            if (!notificacion) return this.responderError(res, 404, 'Notificación no encontrada');
            if (notificacion.destinatarioId !== destinatario.destinatarioId
                || notificacion.destinatarioTipo !== destinatario.destinatarioTipo) {
                return this.responderError(res, 403, 'No puedes modificar una notificación ajena');
            }

            const actualizada = await this.prisma.notificacion.update({
                where: { id },
                data: { estado, leidaAt: estado === 'LEIDA' ? new Date() : null },
            });
            return res.status(200).json(new ResponseModel(actualizada, 0, 'Notificación actualizada correctamente', 200));
        } catch (error) {
            console.error('[NotificacionController Error]:', error);
            return this.responderError(res, 500, 'No se pudo actualizar la notificación');
        }
    };
}

export const notificacionController = new NotificacionController();
