import { prisma } from '../dao/BaseDao.js';
import { ESTADOS_PEDIDO_COMPRA, pedidoCompraDao } from '../dao/PedidoCompraDao.js';
import { ResponseModel } from '../modelos/ResponseModel.js';
import { enviarPushNotificacion } from '../services/notificacionesPush.js';
import { BaseController } from './BaseController.js';

const ESTADOS_SET = new Set(ESTADOS_PEDIDO_COMPRA);

function crearErrorHttp(mensaje, status = 400) {
    const error = new Error(mensaje);
    error.status = status;
    return error;
}

export class PedidoCompraController extends BaseController {
    constructor({
        dao = pedidoCompraDao,
        prismaClient = prisma,
        enviarPush = enviarPushNotificacion,
    } = {}) {
        super(dao);
        this.prisma = prismaClient;
        this.enviarPush = enviarPush;
    }

    manejarError(res, error) {
        if ([400, 403, 404, 409].includes(error?.status)) {
            return res.status(error.status).json(
                new ResponseModel(null, 1, error.message, error.status)
            );
        }
        return this.respuestaError(res, error);
    }

    async resolverEmpleadoAutenticado(req) {
        const usuarioId = Number(req.usuario?.id ?? req.user?.id);
        if (!Number.isSafeInteger(usuarioId) || usuarioId < 1) {
            throw crearErrorHttp('Usuario no autenticado', 401);
        }
        const empresaId = this.obtenerEmpresaId(req);
        const empleado = await this.prisma.empleado.findFirst({
            where: { usuarioId, empresaId, deletedAt: null },
            select: { id: true, usuarioId: true, sucursalId: true },
        });
        if (!empleado) {
            throw crearErrorHttp(
                'Tu cuenta debe estar asociada a un empleado para gestionar pedidos de compra',
                403
            );
        }
        return empleado;
    }

    async notificarResultadoPedido({ pedido, aprobado, validadorEmpleadoId }) {
        const solicitante = pedido?.solicitanteEmpleado;
        if (!solicitante?.id) return;

        try {
            const titulo = aprobado
                ? `Pedido de compra #${pedido.id} aprobado`
                : `Pedido de compra #${pedido.id} rechazado`;
            const motivo = pedido.motivoRechazo ? ` Motivo: ${pedido.motivoRechazo}.` : '';
            const mensaje = aprobado
                ? `Tu pedido #${pedido.id} fue aceptado en web y las existencias se sumaron al inventario.`
                : `Tu pedido #${pedido.id} fue rechazado durante la validación.${motivo}`;

            const notificacion = await this.prisma.notificacion.create({
                data: {
                    empresaId: pedido.empresaId ?? 1,
                    titulo: titulo.slice(0, 150),
                    mensaje,
                    tipo: 'PEDIDO_COMPRA',
                    destinatarioId: solicitante.id,
                    destinatarioTipo: 'EMPLEADO',
                    remitenteId: validadorEmpleadoId ?? null,
                    sucursalId: pedido.sucursalId ?? null,
                },
            });

            if (solicitante.usuarioId) {
                await this.enviarPush({
                    notificacion,
                    destinatarioUsuarioId: solicitante.usuarioId,
                    prismaClient: this.prisma,
                });
            }
        } catch (error) {
            console.error('[Notificacion PedidoCompra Error]:', error?.code ?? error?.message ?? 'envío fallido');
        }
    }

    obtenerTodos = async (req, res) => {
        try {
            const rawEstado = req.query?.estado;
            let estado = null;
            if (rawEstado !== undefined && rawEstado !== '') {
                const normalizado = String(rawEstado).trim().toUpperCase();
                if (!ESTADOS_SET.has(normalizado)) {
                    throw crearErrorHttp('El filtro de estado no es válido', 400);
                }
                estado = normalizado;
            }

            const pedidos = await this.dao.obtenerTodos({
                estado,
                empresaId: this.obtenerEmpresaId(req),
                sucursalId: this.obtenerSucursalId(req),
            });
            return this.respuestaExito(res, pedidos, 'Pedidos de compra obtenidos correctamente');
        } catch (error) {
            return this.manejarError(res, error);
        }
    };

    obtenerPorId = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!Number.isSafeInteger(id) || id < 1) {
                throw crearErrorHttp('El identificador del pedido no es válido', 400);
            }
            const pedido = await this.dao.obtenerPorId(
                id,
                this.obtenerEmpresaId(req),
                this.obtenerSucursalId(req)
            );
            if (!pedido) {
                return this.respuestaNoEncontrado(res, 'Pedido de compra no encontrado');
            }
            return this.respuestaExito(res, pedido, 'Pedido de compra obtenido correctamente');
        } catch (error) {
            return this.manejarError(res, error);
        }
    };

    crear = async (req, res) => {
        try {
            const empleado = await this.resolverEmpleadoAutenticado(req);
            const { proveedor, observaciones, detalles, almacenId } = req.body ?? {};

            if (proveedor !== undefined && proveedor !== null) {
                if (typeof proveedor !== 'string' || proveedor.trim().length > 150) {
                    throw crearErrorHttp('El proveedor no debe exceder 150 caracteres', 400);
                }
            }
            if (observaciones !== undefined && observaciones !== null) {
                if (typeof observaciones !== 'string' || observaciones.trim().length > 500) {
                    throw crearErrorHttp('Las observaciones no deben exceder 500 caracteres', 400);
                }
            }
            if (!Array.isArray(detalles) || detalles.length === 0 || detalles.length > 100) {
                throw crearErrorHttp('El pedido debe incluir entre 1 y 100 productos', 400);
            }

            const detallesValidados = detalles.map((item) => {
                const productoId = Number(item?.productoId);
                const cantidad = Number(item?.cantidad);
                const costoRaw = item?.costoUnitario;

                if (!Number.isSafeInteger(productoId) || productoId < 1) {
                    throw crearErrorHttp('Cada producto del pedido debe tener un identificador válido', 400);
                }
                if (!Number.isSafeInteger(cantidad) || cantidad < 1 || cantidad > 10000) {
                    throw crearErrorHttp('La cantidad por producto debe ser un entero entre 1 y 10000', 400);
                }

                let costoUnitario;
                if (costoRaw !== undefined && costoRaw !== null && costoRaw !== '') {
                    const costo = Number(costoRaw);
                    if (!Number.isFinite(costo) || costo < 0 || costo > 9999999.99) {
                        throw crearErrorHttp('El costo unitario debe ser un monto válido mayor o igual a 0', 400);
                    }
                    costoUnitario = costo;
                }

                return { productoId, cantidad, costoUnitario };
            });

            const sucursalReq = this.obtenerSucursalId(req);
            const sucursalId = sucursalReq === 'todas'
                ? (empleado.sucursalId || 1)
                : sucursalReq;

            let almacenIdValidado = null;
            if (almacenId !== undefined && almacenId !== null && almacenId !== '') {
                const idAlm = Number(almacenId);
                if (!Number.isSafeInteger(idAlm) || idAlm < 1) {
                    throw crearErrorHttp('El identificador del almacén no es válido', 400);
                }
                almacenIdValidado = idAlm;
            }

            const pedido = await this.dao.crearPedido({
                empresaId: this.obtenerEmpresaId(req),
                sucursalId,
                almacenId: almacenIdValidado,
                solicitanteEmpleadoId: empleado.id,
                proveedor: proveedor ?? null,
                observaciones: observaciones ?? null,
                detalles: detallesValidados,
            });

            return res.status(201).json(
                new ResponseModel(pedido, 0, 'Pedido de compra creado correctamente', 201)
            );
        } catch (error) {
            return this.manejarError(res, error);
        }
    };

    aprobar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!Number.isSafeInteger(id) || id < 1) {
                throw crearErrorHttp('El identificador del pedido no es válido', 400);
            }

            const empleado = await this.resolverEmpleadoAutenticado(req);
            const { observaciones } = req.body ?? {};
            if (observaciones !== undefined && observaciones !== null) {
                if (typeof observaciones !== 'string' || observaciones.trim().length > 500) {
                    throw crearErrorHttp('Las observaciones no deben exceder 500 caracteres', 400);
                }
            }

            const pedido = await this.dao.aprobarPedido({
                id,
                empresaId: this.obtenerEmpresaId(req),
                sucursalId: this.obtenerSucursalId(req),
                validadorEmpleadoId: empleado.id,
                observaciones: observaciones !== undefined ? (observaciones ? observaciones.trim() : null) : null,
            });

            await this.notificarResultadoPedido({
                pedido,
                aprobado: true,
                validadorEmpleadoId: empleado.id,
            });

            return this.respuestaExito(res, pedido, 'Pedido aprobado y sumado al inventario correctamente');
        } catch (error) {
            return this.manejarError(res, error);
        }
    };

    rechazar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!Number.isSafeInteger(id) || id < 1) {
                throw crearErrorHttp('El identificador del pedido no es válido', 400);
            }

            const empleado = await this.resolverEmpleadoAutenticado(req);
            const { motivoRechazo } = req.body ?? {};
            if (motivoRechazo !== undefined && motivoRechazo !== null) {
                if (typeof motivoRechazo !== 'string' || motivoRechazo.trim().length > 500) {
                    throw crearErrorHttp('El motivo de rechazo no debe exceder 500 caracteres', 400);
                }
            }

            const pedido = await this.dao.rechazarPedido({
                id,
                empresaId: this.obtenerEmpresaId(req),
                sucursalId: this.obtenerSucursalId(req),
                validadorEmpleadoId: empleado.id,
                motivoRechazo: motivoRechazo ?? null,
            });

            await this.notificarResultadoPedido({
                pedido,
                aprobado: false,
                validadorEmpleadoId: empleado.id,
            });

            return this.respuestaExito(res, pedido, 'Pedido de compra rechazado');
        } catch (error) {
            return this.manejarError(res, error);
        }
    };
}

export const pedidoCompraController = new PedidoCompraController();
