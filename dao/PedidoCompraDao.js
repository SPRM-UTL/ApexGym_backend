import { BaseDao, prisma } from './BaseDao.js';

export const ESTADOS_PEDIDO_COMPRA = Object.freeze(['PENDIENTE', 'APROBADO', 'RECHAZADO']);

const INCLUDE_PEDIDO = {
    sucursal: {
        select: { id: true, nombre: true, codigo: true },
    },
    solicitanteEmpleado: {
        select: { id: true, usuarioId: true, nombre: true, apellidoPaterno: true, apellidoMaterno: true },
    },
    validadorEmpleado: {
        select: { id: true, nombre: true, apellidoPaterno: true, apellidoMaterno: true },
    },
    detalles: {
        include: {
            producto: {
                select: {
                    id: true,
                    nombre: true,
                    codigoBarras: true,
                    stockActual: true,
                    stockMinimo: true,
                    precioCompra: true,
                    precioVenta: true,
                    imagenUrl: true,
                    estado: true,
                },
            },
        },
        orderBy: { id: 'asc' },
    },
};

function crearErrorPedido(mensaje, status = 400) {
    const error = new Error(mensaje);
    error.status = status;
    return error;
}

function redondearDosDecimales(valor) {
    return Math.round(Number(valor) * 100) / 100;
}

export class PedidoCompraDao extends BaseDao {
    constructor({ prismaClient = prisma } = {}) {
        super('pedidoCompra', {
            omit: {
                updatedAt: true,
                deletedAt: true,
            },
        });
        this.prisma = prismaClient;
        this.model = prismaClient.pedidoCompra;
    }

    construirWhereContexto(empresaId, sucursalId, extras = {}) {
        const empId = Number(empresaId);
        const where = {
            deletedAt: null,
            empresaId: Number.isInteger(empId) && empId > 0 ? empId : 1,
            ...extras,
        };
        if (sucursalId !== undefined && sucursalId !== null && sucursalId !== 'todas') {
            const sucId = Number(sucursalId);
            if (Number.isInteger(sucId) && sucId > 0) {
                where.sucursalId = sucId;
            }
        }
        return where;
    }

    async obtenerTodos({ estado = null, empresaId, sucursalId } = {}) {
        const where = this.construirWhereContexto(empresaId, sucursalId, {
            ...(estado ? { estado } : {}),
        });
        return this.prisma.pedidoCompra.findMany({
            where,
            omit: this.omit,
            include: INCLUDE_PEDIDO,
            orderBy: { id: 'desc' },
        });
    }

    async obtenerPorId(id, empresaId, sucursalId) {
        const where = this.construirWhereContexto(empresaId, sucursalId, { id: Number(id) });
        return this.prisma.pedidoCompra.findFirst({
            where,
            omit: this.omit,
            include: INCLUDE_PEDIDO,
        });
    }

    async crearPedido({
        empresaId,
        sucursalId,
        solicitanteEmpleadoId,
        proveedor = null,
        observaciones = null,
        detalles,
    }) {
        const empId = this.resolverEmpresaId(empresaId);
        const sucId = Number(sucursalId);
        if (!Number.isInteger(sucId) || sucId < 1) {
            throw crearErrorPedido('Selecciona una sucursal válida para el pedido de compra', 400);
        }

        // Consolida productos repetidos preservando el costo unitario más reciente enviado si existe.
        const consolidado = new Map();
        for (const item of detalles) {
            const productoId = Number(item.productoId);
            const cantidad = Number(item.cantidad);
            const existente = consolidado.get(productoId);
            const costo = item.costoUnitario !== undefined && item.costoUnitario !== null
                ? Number(item.costoUnitario)
                : existente?.costoUnitario ?? null;
            consolidado.set(productoId, {
                productoId,
                cantidad: (existente?.cantidad ?? 0) + cantidad,
                costoUnitario: costo,
            });
        }

        const productoIds = Array.from(consolidado.keys());

        return this.prisma.$transaction(async (tx) => {
            const productos = await tx.producto.findMany({
                where: {
                    id: { in: productoIds },
                    empresaId: empId,
                    sucursalId: sucId,
                    deletedAt: null,
                },
                select: { id: true, nombre: true, precioCompra: true },
            });

            const productosPorId = new Map(productos.map((p) => [p.id, p]));
            for (const id of productoIds) {
                if (!productosPorId.has(id)) {
                    throw crearErrorPedido(`El producto #${id} no existe en la sucursal seleccionada`, 404);
                }
            }

            let totalEstimado = 0;
            const lineas = productoIds.map((id) => {
                const entrada = consolidado.get(id);
                const prod = productosPorId.get(id);
                const costoUnitario = entrada.costoUnitario !== null && Number.isFinite(entrada.costoUnitario)
                    ? redondearDosDecimales(entrada.costoUnitario)
                    : redondearDosDecimales(Number(prod.precioCompra ?? 0));
                const subtotal = redondearDosDecimales(costoUnitario * entrada.cantidad);
                totalEstimado = redondearDosDecimales(totalEstimado + subtotal);
                return {
                    productoId: id,
                    cantidad: entrada.cantidad,
                    costoUnitario,
                    subtotal,
                };
            });

            return tx.pedidoCompra.create({
                data: {
                    empresaId: empId,
                    sucursalId: sucId,
                    solicitanteEmpleadoId: Number(solicitanteEmpleadoId),
                    proveedor: proveedor ? proveedor.trim() : null,
                    observaciones: observaciones ? observaciones.trim() : null,
                    estado: 'PENDIENTE',
                    totalEstimado,
                    detalles: {
                        create: lineas,
                    },
                },
                omit: this.omit,
                include: INCLUDE_PEDIDO,
            });
        });
    }

    async aprobarPedido({
        id,
        empresaId,
        sucursalId,
        validadorEmpleadoId,
        observaciones = null,
    }) {
        const pedidoId = Number(id);
        const empId = this.resolverEmpresaId(empresaId);
        const whereBase = this.construirWhereContexto(empId, sucursalId, { id: pedidoId });

        return this.prisma.$transaction(async (tx) => {
            // Transición atómica PENDIENTE -> APROBADO para impedir doble suma por concurrencia.
            const actualizado = await tx.pedidoCompra.updateMany({
                where: { ...whereBase, estado: 'PENDIENTE' },
                data: {
                    estado: 'APROBADO',
                    validadorEmpleadoId: Number(validadorEmpleadoId),
                    fechaValidacion: new Date(),
                    ...(observaciones !== null ? { observaciones } : {}),
                },
            });

            if (actualizado.count === 0) {
                const existente = await tx.pedidoCompra.findFirst({
                    where: whereBase,
                    select: { id: true, estado: true },
                });
                if (!existente) {
                    throw crearErrorPedido('Pedido de compra no encontrado', 404);
                }
                throw crearErrorPedido(
                    `El pedido #${pedidoId} ya fue procesado (estado actual: ${existente.estado})`,
                    409
                );
            }

            const pedidoConDetalles = await tx.pedidoCompra.findFirst({
                where: { id: pedidoId },
                select: {
                    id: true,
                    detalles: {
                        select: { productoId: true, cantidad: true },
                    },
                },
            });

            for (const detalle of pedidoConDetalles?.detalles ?? []) {
                const prodRes = await tx.producto.updateMany({
                    where: {
                        id: detalle.productoId,
                        empresaId: empId,
                        deletedAt: null,
                    },
                    data: {
                        stockActual: { increment: detalle.cantidad },
                    },
                });
                if (prodRes.count === 0) {
                    throw crearErrorPedido(
                        `El producto #${detalle.productoId} no está disponible para actualizar inventario`,
                        409
                    );
                }
            }

            return tx.pedidoCompra.findFirst({
                where: { id: pedidoId },
                omit: this.omit,
                include: INCLUDE_PEDIDO,
            });
        });
    }

    async rechazarPedido({
        id,
        empresaId,
        sucursalId,
        validadorEmpleadoId,
        motivoRechazo = null,
    }) {
        const pedidoId = Number(id);
        const empId = this.resolverEmpresaId(empresaId);
        const whereBase = this.construirWhereContexto(empId, sucursalId, { id: pedidoId });

        return this.prisma.$transaction(async (tx) => {
            const actualizado = await tx.pedidoCompra.updateMany({
                where: { ...whereBase, estado: 'PENDIENTE' },
                data: {
                    estado: 'RECHAZADO',
                    validadorEmpleadoId: Number(validadorEmpleadoId),
                    motivoRechazo: motivoRechazo ? motivoRechazo.trim() : null,
                    fechaValidacion: new Date(),
                },
            });

            if (actualizado.count === 0) {
                const existente = await tx.pedidoCompra.findFirst({
                    where: whereBase,
                    select: { id: true, estado: true },
                });
                if (!existente) {
                    throw crearErrorPedido('Pedido de compra no encontrado', 404);
                }
                throw crearErrorPedido(
                    `El pedido #${pedidoId} ya fue procesado (estado actual: ${existente.estado})`,
                    409
                );
            }

            return tx.pedidoCompra.findFirst({
                where: { id: pedidoId },
                omit: this.omit,
                include: INCLUDE_PEDIDO,
            });
        });
    }
}

export const pedidoCompraDao = new PedidoCompraDao();
