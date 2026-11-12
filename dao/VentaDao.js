import { BaseDao } from "./BaseDao.js";
//dependecia que nos permite hacer movimientos y redondeo de dinero
import currency from "currency.js";
import { TASA_IVA } from "../utilidades/constantes.js";

const ESTADO_CAJA = { ABIERTA: "ABIERTA", CERRADA: "CERRADA" };
const ESTADO_VENTA = { COMPLETADA : "completada" , CANCELADA : "cancelada"}
const ETIQUETAS_ESTADO_DEVOLUCION = {
    SIN_DEVOLUCION: 'Sin devolución',
    SIN_DEVOLUCIONES: 'Sin devoluciones',
    DEVUELTA_PARCIALMENTE: 'Devuelta parcialmente',
    DEVUELTA_TOTALMENTE: 'Devuelta totalmente',
};

export class VentaDao extends BaseDao {
    constructor() {
        super(
            "venta",
            {
                omit : {
                    createdAt : true,
                    updatedAt : true,
                    deletedAt : true,
                    metodoPagoLegacy: true,
                }
            }
        );
    }

async getAll() {
    return this.prisma.venta.findMany({
        where: { deletedAt: null },
        omit: {...this.omit, createdAt: false},
        include: {
            cliente: {
                select: {
                    id: true,
                    nombre: true,
                },
            },
            empleado: {
                select: {
                    id: true,
                    nombre: true,
                    apellidoPaterno: true,
                },
            },
            folioVenta : {
                select : {
                    id : true
                }
            },
            aperturaCaja: {
                select: {
                    id: true,
                    estado: true,
                    empleado: {
                        select: {
                            id: true,
                            nombre: true,
                        },
                    },
                    caja: {
                        select: {
                            id: true,
                            nombre: true,
                        },
                    },
                },
            },
            metodoPago: {
                select: {
                    id: true,
                    nombre: true,
                    codigo: true,
                },
            },
        },
        orderBy: { id: 'desc' },
    });
}

async obtenerVentas({ pagina, limite, clienteId, cliente, busqueda, fechaDesde, fechaHasta, metodoPagoId, estado }) {
    const condiciones = [
        {
            OR: [
                { deletedAt: null },
                { estado: { in: ['cancelada', 'cancelado'] } },
            ],
        },
    ];

    if (clienteId !== undefined) condiciones.push({ clienteId });
    if (metodoPagoId !== undefined) condiciones.push({ metodoPagoId });
    if (cliente) {
        condiciones.push({
            cliente: {
                is: {
                    OR: [
                        { nombre: { contains: cliente } },
                        { apellidoPaterno: { contains: cliente } },
                        { apellidoMaterno: { contains: cliente } },
                    ],
                },
            },
        });
    }
    if (busqueda) {
        const idNumerico = /^\d+$/.test(busqueda) ? Number(busqueda) : null;
        condiciones.push({
            OR: [
                ...(Number.isSafeInteger(idNumerico) && idNumerico > 0
                    ? [{ folioVenta: { is: { id: idNumerico } } }]
                    : []),
                {
                    cliente: {
                        is: {
                            OR: [
                                { nombre: { contains: busqueda } },
                                { apellidoPaterno: { contains: busqueda } },
                                { apellidoMaterno: { contains: busqueda } },
                            ],
                        },
                    },
                },
                {
                    empleado: {
                        is: {
                            OR: [
                                { nombre: { contains: busqueda } },
                                { apellidoPaterno: { contains: busqueda } },
                            ],
                        },
                    },
                },
                { estado: { contains: busqueda } },
                { metodoPago: { is: { nombre: { contains: busqueda } } } },
            ],
        });
    }
    if (fechaDesde || fechaHasta) {
        condiciones.push({
            createdAt: {
                ...(fechaDesde && { gte: fechaDesde }),
                ...(fechaHasta && { lte: fechaHasta }),
            },
        });
    }
    if (estado === 'completada') {
        condiciones.push({ estado: { in: ['completada', 'completado', 'completa'] } });
    } else if (estado === 'cancelada') {
        condiciones.push({ estado: { in: ['cancelada', 'cancelado'] } });
    }

    const where = { AND: condiciones };
    const skip = (pagina - 1) * limite;
    const include = {
        cliente: { select: { id: true, nombre: true, apellidoPaterno: true, apellidoMaterno: true } },
        empleado: { select: { id: true, nombre: true, apellidoPaterno: true } },
        folioVenta: { select: { id: true } },
        aperturaCaja: {
            select: {
                id: true,
                estado: true,
                empleado: { select: { id: true, nombre: true } },
                caja: { select: { id: true, nombre: true } },
            },
        },
        metodoPago: { select: { id: true, nombre: true, codigo: true } },
    };

    const [registros, total] = await Promise.all([
        this.prisma.venta.findMany({
            where,
            omit: { ...this.omit, createdAt: false },
            include,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip,
            take: limite,
        }),
        this.prisma.venta.count({ where }),
    ]);

    return { registros, total, pagina, limite };
}

async getById(id, client = this.prisma) {
    const venta = await client.venta.findFirst({
        where: {
            id: Number(id),
            OR: [
                { deletedAt: null },
                { estado: { in: ['cancelada', 'cancelado'] } },
            ],
        },
        omit: this.omit,
        include: {
            cliente: {
                select: {
                    id: true,
                    nombre: true,
                },
            },
            empleado: {
                select: {
                    id: true,
                    nombre: true,
                    apellidoPaterno: true,
                },
            },
            aperturaCaja: {
                select: {
                    id: true,
                    estado: true,
                    empleado: {
                        select: {
                            id: true,
                            nombre: true,
                        },
                    },
                    caja: {
                        select: {
                            id: true,
                            nombre: true,
                        },
                    },
                },
            },
            metodoPago: {
                select: {
                    id: true,
                    nombre: true,
                    codigo: true,
                },
            },
            devoluciones: {
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    createdAt: true,
                    monto: true,
                    motivo: true,
                    empleado: {
                        select: {
                            id: true,
                            nombre: true,
                            apellidoPaterno: true,
                            apellidoMaterno: true,
                        },
                    },
                    metodoPago: {
                        select: {
                            id: true,
                            nombre: true,
                            codigo: true,
                        },
                    },
                },
            },
            detalleVenta: {
                include: {
                    devoluciones: {
                        select: {
                            cantidad: true,
                        },
                    },
                    producto: {
                        select: {
                            id: true,
                            nombre: true,
                        },
                    },
                    servicio: {
                        select: {
                            id: true,
                            nombre: true,
                        },
                    },
                    tipoMembresia: {
                        select: {
                            id: true,
                            nombre: true,
                        },
                    },
                },
            },
        },
    });

    if (!venta) return null;

    const estadoVenta = String(venta.estado ?? '').trim().toLowerCase();
    const ventaCompletada = ['completada', 'completado'].includes(estadoVenta);
    const detalleVenta = venta.detalleVenta.map((detalle) => {
        const { devoluciones, ...detalleVenta } = detalle;
        const cantidadDevuelta = devoluciones.reduce(
            (total, devolucion) => total + Number(devolucion.cantidad),
            0
        );
        const cantidadDisponible = detalle.cantidad - cantidadDevuelta;
        const esMembresia = detalle.tipoItem === 'MEMBRESIA';

        const estadoDevolucion = cantidadDevuelta === 0
            ? 'SIN_DEVOLUCION'
            : cantidadDisponible <= 0
                ? 'DEVUELTA_TOTALMENTE'
                : 'DEVUELTA_PARCIALMENTE';

        return {
            ...detalleVenta,
            cantidadDevuelta,
            cantidadDisponible,
            estadoDevolucion,
            estadoDevolucionEtiqueta: ETIQUETAS_ESTADO_DEVOLUCION[estadoDevolucion],
            puedeDevolverse: ventaCompletada && !esMembresia && cantidadDisponible > 0,
            articuloNombre:
                detalle.producto?.nombre ??
                detalle.servicio?.nombre ??
                detalle.tipoMembresia?.nombre ??
                detalle.descripcion,
        };
    });
    const totalDevuelto = venta.devoluciones.reduce(
        (total, devolucion) => total.add(Number(devolucion.monto)),
        currency(0)
    );
    const cantidadVendida = detalleVenta.reduce((total, detalle) => total + detalle.cantidad, 0);
    const cantidadDevuelta = detalleVenta.reduce((total, detalle) => total + detalle.cantidadDevuelta, 0);
    const cantidadDisponible = detalleVenta.reduce(
        (total, detalle) => total + (
            detalle.puedeDevolverse ? detalle.cantidadDisponible : 0
        ),
        0
    );
    const puedeRegistrarDevolucion = ventaCompletada && cantidadDisponible > 0;
    const estadoDevolucion = cantidadDevuelta === 0
        ? 'SIN_DEVOLUCIONES'
        : cantidadVendida > 0 && cantidadDevuelta >= cantidadVendida
            ? 'DEVUELTA_TOTALMENTE'
            : 'DEVUELTA_PARCIALMENTE';
    const estadoDevolucionEtiqueta = ETIQUETAS_ESTADO_DEVOLUCION[estadoDevolucion];

    return {
        ...venta,
        devoluciones: venta.devoluciones.map((devolucion) => ({
            ...devolucion,
            monto: Number(devolucion.monto),
            empleadoNombre: [
                devolucion.empleado.nombre,
                devolucion.empleado.apellidoPaterno,
                devolucion.empleado.apellidoMaterno,
            ].filter(Boolean).join(' '),
        })),
        detalleVenta,
        estadoDevolucion,
        estadoDevolucionEtiqueta,
        puedeRegistrarDevolucion,
        resumenDevoluciones: {
            cantidadDevoluciones: venta.devoluciones.length,
            cantidadVendida,
            cantidadDevuelta,
            cantidadDisponible,
            totalDevuelto: totalDevuelto.value,
            neto: currency(venta.total).subtract(totalDevuelto.value).value,
            estadoDevolucion,
            estadoDevolucionEtiqueta,
            puedeRegistrarDevolucion,
        },
    };
}

async obtenerResumenVentasPorApertura(aperturaCajaId, client = this.prisma) {
    const idApertura = Number(aperturaCajaId);
    if (!Number.isSafeInteger(idApertura) || idApertura <= 0) {
        throw new Error('ID de apertura no válido');
    }

    const ventas = await client.venta.findMany({
        where: {
            aperturaCajaId: idApertura,
            deletedAt: null,
        },
        select: {
            id: true,
            total: true,
            estado: true,
            metodoPagoId: true,
            metodoPagoLegacy: true,
            metodoPago: {
                select: {
                    id: true,
                    nombre: true,
                    codigo: true,
                },
            },
        },
    });

    let totalVentas = currency(0);
    let cantidadVentas = 0;
    let totalVentasEfectivo = currency(0);
    let totalVentasEfectivoCanceladas = currency(0);
    let totalVentasCanceladas = currency(0);
    let cantidadVentasCanceladas = 0;
    const metodosMap = new Map();

    for (const venta of ventas) {
        const totalItem = currency(venta.total);
        const esCancelada = ['cancelada', 'cancelado'].includes(String(venta.estado ?? '').trim().toLowerCase());
        const esEfectivo = venta.metodoPago?.codigo === 'EFECTIVO'
            || (!venta.metodoPago && String(venta.metodoPagoLegacy ?? '').trim().toLowerCase() === 'efectivo');

        if (esCancelada) {
            totalVentasCanceladas = totalVentasCanceladas.add(totalItem);
            cantidadVentasCanceladas += 1;
            if (esEfectivo) {
                totalVentasEfectivoCanceladas = totalVentasEfectivoCanceladas.add(totalItem);
            }
        } else {
            totalVentas = totalVentas.add(totalItem);
            cantidadVentas += 1;
            if (esEfectivo) {
                totalVentasEfectivo = totalVentasEfectivo.add(totalItem);
            }

            const metodoKey = String(venta.metodoPago?.id ?? venta.metodoPagoId ?? 'sin_metodo');
            if (!metodosMap.has(metodoKey)) {
                metodosMap.set(metodoKey, {
                    metodoPagoId: venta.metodoPago?.id ?? venta.metodoPagoId ?? null,
                    codigo: venta.metodoPago?.codigo ?? null,
                    nombre: venta.metodoPago?.nombre ?? 'Sin método asignado',
                    total: currency(0),
                    cantidad: 0,
                    transacciones: 0,
                });
            }
            const itemMetodo = metodosMap.get(metodoKey);
            itemMetodo.total = itemMetodo.total.add(totalItem);
            itemMetodo.cantidad += 1;
            itemMetodo.transacciones += 1;
        }
    }

    const ventasPorMetodoPago = Array.from(metodosMap.values()).map((m) => ({
        metodoPagoId: m.metodoPagoId,
        codigo: m.codigo,
        nombre: m.nombre,
        total: m.total.value,
        cantidad: m.cantidad,
        transacciones: m.transacciones,
    }));

    const totalVentasEfectivoBruto = totalVentasEfectivo.add(totalVentasEfectivoCanceladas);
    const promedioVentas = cantidadVentas > 0
        ? currency(totalVentas.value / cantidadVentas).value
        : 0;

    return {
        totalVentas: totalVentas.value,
        cantidadVentas,
        transaccionesVentas: cantidadVentas,
        promedioVentas,
        ticketPromedio: promedioVentas,
        totalVentasEfectivo: totalVentasEfectivo.value,
        ventasPorMetodoPago,
        totalVentasCanceladas: totalVentasCanceladas.value,
        cantidadVentasCanceladas,
        totalVentasEfectivoCanceladas: totalVentasEfectivoCanceladas.value,
        totalVentasEfectivoBruto: totalVentasEfectivoBruto.value,
    };
}

async create(data) {
    const {
        detalleVenta,
        empleadoId,
        clienteId,
        usuarioId,
        subtotal: subtotalEnviado,
        total: totalEnviado,
        montoRecibido: montoRecibidoEnviado,
        ...restoDatos
    } = data;

    const aperturaCajaId = this.validarId(
        data.aperturaCajaId,
        'la apertura de caja'
    );

    const idEmpleado = this.validarId(empleadoId, 'el empleado');
    const idCliente = this.validarId(clienteId, 'el cliente');
    const idUsuario = this.validarId(usuarioId, 'el usuario autenticado');

    this.validarDetalles(detalleVenta);

    return this.prisma.$transaction(async (tx) => {
        const empleado = await tx.empleado.findFirst({
            where: {
                id: idEmpleado,
                deletedAt: null,
            },
            select: { id: true },
        });

        if (!empleado) {
            throw new Error('El empleado no existe');
        }

        const cliente = await tx.cliente.findFirst({
            where: {
                id: idCliente,
                deletedAt: null,
            },
            select: { id: true },
        });

        if (!cliente) {
            throw new Error('El cliente no existe');
        }

        const metodoPago = await this.validarMetodoPago(
            tx,
            restoDatos.metodoPagoId
        );

        // Bloquear la fila de apertura para serializar con corte de caja
        const aperturasBloqueadas = await tx.$queryRaw`
            SELECT id, estado, empleado_id AS empleadoId
            FROM aperturas_caja
            WHERE id = ${aperturaCajaId} AND deleted_at IS NULL
            FOR UPDATE
        `;
        const cajaAbierta = aperturasBloqueadas[0];

        if (!cajaAbierta || cajaAbierta.estado !== ESTADO_CAJA.ABIERTA || Number(cajaAbierta.empleadoId) !== Number(empleado.id)) {
            const error = new Error('La apertura de caja no está disponible');
            error.code = 'APERTURA_CAJA_CERRADA';
            error.status = 409;
            throw error;
        }

        const detalles = await this.prepararDetalles(
            tx,
            detalleVenta
        );

        const { subtotal, total } = this.calcularTotal(detalles);
        this.validarMontos(
            { subtotal, total },
            { subtotal: subtotalEnviado, total: totalEnviado }
        );
        const esPagoEfectivo = metodoPago.codigo === 'EFECTIVO';
        const montoRecibido = esPagoEfectivo
            ? this.validarMontoRecibido(montoRecibidoEnviado, total)
            : total;
        const cambio = esPagoEfectivo
            ? currency(montoRecibido).subtract(total).value
            : 0;

        const nuevaVenta = await tx.venta.create({
            data: {
                aperturaCaja: { connect: { id: cajaAbierta.id } },
                empleado: { connect: { id: empleado.id } },
                cliente: { connect: { id: cliente.id } },
                usuario: { connect: { id: idUsuario } },
                metodoPago: { connect: { id: metodoPago.id } },
                subtotal,
                total,
                montoRecibido,
                cambio,
                detalleVenta: {
                    create: detalles,
                },
                folioVenta : { create : {} }
            },
            include : {folioVenta : true}
        });

        await this.ajustarStock(tx, [], detalles);

        return this.getById(nuevaVenta.id, tx);
    });
}

async update(id, data) {
    const ventaId = this.validarId(id, 'la venta');

    if (
        data.metodoPagoId === undefined &&
        data.detalleVenta === undefined
    ) {
        throw new Error('No hay campos para actualizar');
    }

    if (data.detalleVenta !== undefined) {
        if (data.subtotal === undefined || data.total === undefined) {
            throw new Error('El subtotal y el total son requeridos al actualizar el detalle de una venta');
        }
        this.validarDetalles(data.detalleVenta);
    }

    return this.prisma.$transaction(async (tx) => {
        const referenciaVenta = await tx.venta.findFirst({
            where: {
                id: ventaId,
                deletedAt: null,
            },
            select: { aperturaCajaId: true },
        });

        if (!referenciaVenta) {
            throw new Error('La venta no existe');
        }
        if (!referenciaVenta.aperturaCajaId) {
            throw new Error('La venta no tiene una apertura de caja asociada');
        }

        // Bloquear la fila de apertura para serializar con corte de caja
        const cajasUpdateBloqueadas = await tx.$queryRaw`
            SELECT id, estado
            FROM aperturas_caja
            WHERE id = ${referenciaVenta.aperturaCajaId} AND deleted_at IS NULL
            FOR UPDATE
        `;
        const caja = cajasUpdateBloqueadas[0];

        if (!caja || caja.estado !== ESTADO_CAJA.ABIERTA) {
            throw new Error('La caja de esta venta está cerrada');
        }

        const ventasUpdateBloqueadas = await tx.$queryRaw`
            SELECT id
            FROM venta
            WHERE id = ${ventaId} AND deleted_at IS NULL
            FOR UPDATE
        `;
        if (ventasUpdateBloqueadas.length === 0) {
            throw new Error('La venta no existe');
        }

        const venta = await tx.venta.findFirst({
            where: {
                id: ventaId,
                deletedAt: null,
            },
            include: {
                detalleVenta: true,
            },
        });
        if (!venta) {
            throw new Error('La venta no existe');
        }
        if (venta.estado === ESTADO_VENTA.CANCELADA) {
            throw new Error('No se puede modificar una venta cancelada');
        }

        const metodoPago = data.metodoPagoId === undefined
            ? undefined
            : await this.validarMetodoPago(tx, data.metodoPagoId);

        if (data.detalleVenta === undefined) {
            await tx.venta.update({
                where: { id: ventaId },
                data: metodoPago
                    ? { metodoPago: { connect: { id: metodoPago.id } } }
                    : {},
            });

            return this.getById(ventaId, tx);
        }

        const items = data.detalleVenta ??
            venta.detalleVenta.map((d) => ({
                tipoItem: d.tipoItem,
                productoId: d.productoId,
                servicioId: d.servicioId,
                tipoMembresiaId: d.tipoMembresiaId,
                cantidad: d.cantidad,
                descripcion: d.descripcion,
            }));

        const detalles = await this.prepararDetalles(tx, items, venta.detalleVenta);

        const { subtotal, total } = this.calcularTotal(
            detalles,
        );
        this.validarMontos(
            { subtotal, total },
            { subtotal: data.subtotal, total: data.total }
        );

        await tx.detalleVenta.deleteMany({
            where: { ventaId },
        });

        await tx.venta.update({
            where: { id: ventaId },
            data: {
                subtotal,
                total,
                ...(metodoPago
                    ? { metodoPago: { connect: { id: metodoPago.id } } }
                    : {}),
                detalleVenta: {
                    create: detalles,
                },
            },
        });

        await this.ajustarStock(
            tx,
            venta.detalleVenta,
            detalles
        );

        return this.getById(ventaId, tx);
    }, { isolationLevel: 'ReadCommitted' });
}
async cancel(id, motivoCancelacion) {
    const ventaId = this.validarId(id, 'la venta');

    return this.prisma.$transaction(async (tx) => {
        const referenciaVenta = await tx.venta.findFirst({
            where: {
                id: ventaId,
                deletedAt: null,
            },
            select: { aperturaCajaId: true },
        });

        if (!referenciaVenta) {
            throw new Error('La venta no existe');
        }
        if (!referenciaVenta.aperturaCajaId) {
            throw new Error('La venta no tiene una apertura de caja asociada');
        }

        const cajasCancelBloqueadas = await tx.$queryRaw`
            SELECT id, estado
            FROM aperturas_caja
            WHERE id = ${referenciaVenta.aperturaCajaId} AND deleted_at IS NULL
            FOR UPDATE
        `;
        const caja = cajasCancelBloqueadas[0];

        if (!caja || caja.estado !== ESTADO_CAJA.ABIERTA) {
            throw new Error('No se puede cancelar: la caja está cerrada');
        }

        const ventasCancelBloqueadas = await tx.$queryRaw`
            SELECT id
            FROM venta
            WHERE id = ${ventaId} AND deleted_at IS NULL
            FOR UPDATE
        `;
        if (ventasCancelBloqueadas.length === 0) {
            throw new Error('La venta no existe');
        }

        const venta = await tx.venta.findFirst({
            where: { id: ventaId, deletedAt: null },
            include: {
                detalleVenta: true,
                metodoPago: {
                    select: { codigo: true },
                },
                folioVenta: {
                    select: { id: true },
                },
            },
        });

        if (venta.estado === ESTADO_VENTA.CANCELADA) {
            throw new Error('La venta ya está cancelada');
        }

        const devolucionesExistentes = await tx.devolucion.count({
            where: { ventaId },
        });
        if (devolucionesExistentes > 0) {
            throw new Error('No se puede cancelar una venta que ya tiene devoluciones');
        }

        await this.ajustarStock(tx, venta.detalleVenta, []);

        const esPagoEfectivo = venta.metodoPago?.codigo === 'EFECTIVO'
            || (!venta.metodoPago && String(venta.metodoPagoLegacy ?? '').trim().toLowerCase() === 'efectivo');

        if (esPagoEfectivo) {
            await tx.movimientoCaja.create({
                data: {
                    aperturaCajaId: caja.id,
                    empleadoId: venta.empleadoId,
                    tipo: 'SALIDA',
                    monto: venta.total,
                    concepto: `Cancelación de venta folio ${venta.folioVenta.id}`,
                    estado: 'PENDIENTE',
                },
            });
        }

        return tx.venta.update({
            where: { id: ventaId },
            data: {
                estado: ESTADO_VENTA.CANCELADA,
                motivoCancelacion,
            },
            omit: this.omit,
        });
    }, { isolationLevel: 'ReadCommitted' });
}
    validarId(id, modulo = "indefinido") {
    const n = Number(id);

    if (
        id === undefined ||
        id === null ||
        id === "" ||
        !Number.isInteger(n) ||
        n <= 0
    ) {
        throw new Error(
            `Error en el identificador del modulo de ${modulo}`
        );
    }

    return n;
}

validarDetalles(detalleVenta) {
    if (!Array.isArray(detalleVenta) || detalleVenta.length === 0) {
        throw new Error('La venta debe tener al menos un artículo');
    }

    const vistos = new Set();

    for (const item of detalleVenta) {
        if (!Number.isInteger(item.cantidad) || item.cantidad <= 0) {
            throw new Error('La cantidad debe ser un entero mayor a 0');
        }

        let id;

        switch (item.tipoItem) {
            case 'PRODUCTO':
                id = item.productoId;
                break;

            case 'SERVICIO':
                id = item.servicioId;
                break;

            case 'MEMBRESIA':
                id = item.tipoMembresiaId;
                break;

            default:
                throw new Error('El tipo de artículo no es válido');
        }

        if (!Number.isInteger(id) || id <= 0) {
            throw new Error(
                `El identificador del artículo ${item.tipoItem} no es válido`
            );
        }

        const clave = `${item.tipoItem}-${id}`;

        if (vistos.has(clave)) {
            throw new Error('El artículo está repetido en la venta');
        }

        vistos.add(clave);
    }
}

    validarMontoRecibido(valor, total) {
        const monto = Number(valor);
        if (valor === undefined || valor === null || valor === '' || !Number.isFinite(monto) || monto < 0) {
            throw new Error('El monto recibido es requerido para pagos en efectivo');
        }
        if (currency(monto).intValue < currency(total).intValue) {
            throw new Error('El monto recibido no cubre el total de la venta');
        }
        return currency(monto).value;
    }

    async validarMetodoPago(tx, metodoPagoId) {
        const id = Number(metodoPagoId);

        if (metodoPagoId === undefined || metodoPagoId === null || metodoPagoId === '') {
            throw new Error("El método de pago es requerido");
        }

        if (!Number.isInteger(id) || id <= 0) {
            throw new Error("El ID del método de pago no es válido");
        }

        const metodo = await tx.metodoPago.findFirst({
            where: {
                id,
                estado: "activo",
                deletedAt: null,
            },
            select: { id: true, codigo: true },
        });
        if (!metodo) {
            throw new Error("Método de pago no válido");
        }

        return metodo;
    }


async prepararDetalles(tx, items, detallesViejos = []) {
    const detalles = [];

    const detallesAnteriores = new Map(
        detallesViejos
            .filter((d) => d.tipoItem === "PRODUCTO")
            .map((d) => [d.productoId, d])
    );

    for (const item of items) {
        const tipoItem = String(item.tipoItem ?? "")
            .trim()
            .toUpperCase();

        const cantidad = Number(item.cantidad);

        if (!Number.isInteger(cantidad) || cantidad <= 0) {
            throw new Error("La cantidad debe ser un entero mayor que cero");
        }

        let registro;
        let productoId = null;
        let servicioId = null;
        let tipoMembresiaId = null;
        let precio;
        let descuentoUnitario = currency(0).value;

        switch (tipoItem) {
            case "PRODUCTO": {
                productoId = this.validarId(
                    item.productoId,
                    "el producto"
                );

                registro = await tx.producto.findFirst({
                    where: {
                        id: productoId,
                        deletedAt: null
                    }
                });

                if (!registro) {
                    throw new Error(
                        `El producto ${productoId} no existe o está eliminado`
                    );
                }

                const anterior = detallesAnteriores.get(productoId);

                precio =
                    anterior?.precioUnitario ??
                    registro.precioVenta;
                const descuentoPorcentaje = Number(registro.descuentoPorcentaje ?? 0);
                if (
                    !Number.isFinite(descuentoPorcentaje)
                    || descuentoPorcentaje < 0
                    || descuentoPorcentaje > 100
                ) {
                    throw new Error(
                        `El descuento del producto ${productoId} debe estar entre 0 y 100`
                    );
                }
                descuentoUnitario = anterior
                    ? currency(anterior.descuentoUnitario ?? 0).value
                    : currency(precio).multiply(descuentoPorcentaje / 100).value;

                break;
            }

            case "SERVICIO": {
                servicioId = this.validarId(
                    item.servicioId,
                    "el servicio"
                );

                registro = await tx.servicio.findUnique({
                    where: { id: servicioId }
                });

                if (!registro) {
                    throw new Error(
                        `El servicio ${servicioId} no existe`
                    );
                }

                precio = registro.precioVenta ?? registro.precio;

                break;
            }

            case "MEMBRESIA": {
                tipoMembresiaId = this.validarId(
                    item.tipoMembresiaId,
                    "el tipo de membresía"
                );

                registro = await tx.tipoMembresia.findUnique({
                    where: { id: tipoMembresiaId }
                });

                if (!registro) {
                    throw new Error(
                        `El tipo de membresía ${tipoMembresiaId} no existe`
                    );
                }

                precio = registro.precioVenta ?? registro.precio;

                break;
            }

            default:
                throw new Error(
                    `El tipo de artículo "${tipoItem}" no es válido`
                );
        }

        precio = Number(precio);

        if (!Number.isFinite(precio) || precio < 0) {
            throw new Error(
                `El precio del artículo "${tipoItem}" no es válido`
            );
        }

        if (currency(descuentoUnitario).intValue > currency(precio).intValue) {
            throw new Error(`El descuento de "${registro.nombre ?? tipoItem}" no puede superar su precio`);
        }
        const subtotalLinea = currency(precio)
            .subtract(descuentoUnitario)
            .multiply(cantidad)
            .value;

        detalles.push({
            tipoItem,
            productoId,
            servicioId,
            tipoMembresiaId,
            clienteMembresiaId: null,
            descripcion: item.descripcion ?? registro.nombre ?? null,
            cantidad,
            precioUnitario: precio,
            descuentoUnitario,
            subtotal: subtotalLinea
        });
    }

    return detalles;
}


async ajustarStock(tx, detallesViejos, detallesNuevos) {
    const filtrarProductos = (detalles) =>
        detalles.filter((d) => d.tipoItem === 'PRODUCTO');

    const anteriores = filtrarProductos(detallesViejos);
    const nuevos = filtrarProductos(detallesNuevos);

    const stockAnterior = new Map(
        anteriores.map((d) => [d.productoId, d.cantidad])
    );

    const stockNuevo = new Map(
        nuevos.map((d) => [d.productoId, d.cantidad])
    );

    const ids = new Set([
        ...stockAnterior.keys(),
        ...stockNuevo.keys(),
    ]);

    for (const productoId of ids) {
        const diferencia =
            (stockNuevo.get(productoId) ?? 0) -
            (stockAnterior.get(productoId) ?? 0);

        if (diferencia > 0) {
            const resultado = await tx.producto.updateMany({
                where: {
                    id: productoId,
                    stockActual: { gte: diferencia },
                    deletedAt: null,
                },
                data: {
                    stockActual: { decrement: diferencia },
                },
            });

            if (resultado.count === 0) {
                throw new Error(
                    `Stock insuficiente para el producto ${productoId}`
                );
            }
        } else if (diferencia < 0) {
            await tx.producto.update({
                where: { id: productoId },
                data: {
                    stockActual: { increment: -diferencia },
                },
            });
        }
    }
}
    //Permite hacer el calculo total de la venta
    calcularTotal(detalles) {
        const subtotal = detalles.reduce((acc, d) => acc.add(d.subtotal), currency(0));
        const iva = subtotal.multiply(TASA_IVA);
        const total = subtotal.add(iva);
        return { subtotal: subtotal.value, total: total.value };
    }

    validarMontos(calculados, enviados) {
        const subtotalEnviado = Number(enviados.subtotal);
        const totalEnviado = Number(enviados.total);
        if (
            enviados.subtotal === undefined
            || enviados.subtotal === null
            || !Number.isFinite(subtotalEnviado)
            || enviados.total === undefined
            || enviados.total === null
            || !Number.isFinite(totalEnviado)
        ) {
            throw new Error('El subtotal y el total enviados deben ser montos válidos');
        }

        const coincide = (calculado, enviado) =>
            currency(calculado).intValue === currency(enviado).intValue;

        if (!coincide(calculados.subtotal, subtotalEnviado)
            || !coincide(calculados.total, totalEnviado)) {
            throw new Error(
                `Los montos enviados no coinciden con el cálculo del servidor. Subtotal esperado: ${calculados.subtotal}, total esperado: ${calculados.total}`
            );
        }
    }

}

export const ventaDao = new VentaDao();
