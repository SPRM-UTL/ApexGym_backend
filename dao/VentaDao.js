import { BaseDao } from "./BaseDao.js";
//dependecia que nos permite hacer movimientos y redondeo de dinero
import currency from "currency.js";
import crypto from "node:crypto";
import { ESTADOS_ACTIVOS_CATALOGO, TASA_IVA } from "../utils/constantes.js";
import { pagoService, PROVEEDOR_POR_CODIGO_METODO } from "../services/PagoService.js";
import { completarReembolso, validarReembolso } from "./DevolucionDao.js";
import { clienteMembresiaDao } from "./ClienteMembresiaDao.js";

const ESTADO_CAJA = { ABIERTA: "ABIERTA" };
const ESTADO_VENTA = { COMPLETADA : "completada" , CANCELADA : "cancelada"}
const ETIQUETAS_ESTADO_DEVOLUCION = {
    SIN_DEVOLUCION: 'Sin devolución',
    SIN_DEVOLUCIONES: 'Sin devoluciones',
    DEVUELTA_PARCIALMENTE: 'Devuelta parcialmente',
    DEVUELTA_TOTALMENTE: 'Devuelta totalmente',
    REEMBOLSO_PENDIENTE: 'Reembolso pendiente',
};

function crearErrorArticuloNoDisponible(mensaje) {
    const error = new Error(mensaje);
    error.status = 400;
    return error;
}

export function prepararCancelacionConDevoluciones(detallesVenta, devoluciones) {
    const cantidadesDevueltas = new Map();
    for (const devolucion of devoluciones) {
        if (devolucion.estadoReembolso !== 'COMPLETADA') continue;
        for (const detalle of devolucion.detalles ?? []) {
            const detalleVentaId = Number(detalle.detalleVentaId);
            const cantidad = Number(detalle.cantidad);
            cantidadesDevueltas.set(
                detalleVentaId,
                (cantidadesDevueltas.get(detalleVentaId) ?? 0) + cantidad
            );
        }
    }

    const estaTotalmenteDevuelta = detallesVenta.length > 0
        && detallesVenta.every((detalle) => (
            (cantidadesDevueltas.get(detalle.id) ?? 0) >= Number(detalle.cantidad)
        ));
    const detallesStock = detallesVenta
        .map((detalle) => ({
            detalleVentaId: detalle.id,
            productoId: detalle.productoId,
            cantidad: Math.max(
                0,
                Number(detalle.cantidad) - (cantidadesDevueltas.get(detalle.id) ?? 0)
            ),
            regresaAStock: detalle.tipoItem === 'PRODUCTO',
        }))
        .filter((detalle) => detalle.regresaAStock && detalle.cantidad > 0);

    return { estaTotalmenteDevuelta, detallesStock };
}

export class VentaDao extends BaseDao {
    constructor() {
        super(
            "venta",
            {
                omit : {
                    createdAt : true,
                    updatedAt : true,
                    deletedAt : true,
                }
            }
        );
    }

    async activarMembresiasDeVenta(tx, ventaId, clienteId, { empresaId, sucursalId } = {}) {
        const detalles = await tx.detalleVenta.findMany({
            where: {
                ventaId: Number(ventaId),
                tipoItem: 'MEMBRESIA',
                clienteMembresiaId: null,
            },
            orderBy: { id: 'asc' },
        });

        for (const detalle of detalles) {
            const membresia = await clienteMembresiaDao.asignarEnTransaccion(tx, {
                clienteId,
                tipoMembresiaId: detalle.tipoMembresiaId,
                empresaId,
                sucursalId,
            });

            await tx.detalleVenta.update({
                where: { id: detalle.id },
                data: { clienteMembresiaId: membresia.id },
            });
        }
    }

aplicarContextoVenta(where, empresaId, sucursalId) {
    const contextoApertura = {};
    if (this.useEmpresa) {
        contextoApertura.empresaId = this.resolverEmpresaId(empresaId);
    }
    if (this.useSucursal) {
        const sucursalResuelta = this.resolverSucursalId(sucursalId);
        if (sucursalResuelta !== null) {
            contextoApertura.sucursalId = sucursalResuelta;
        }
    }

    return Object.keys(contextoApertura).length === 0
        ? where
        : {
            ...where,
            aperturaCaja: { is: contextoApertura },
        };
}

async obtenerVentas({
    pagina,
    limite,
    clienteId,
    cliente,
    busqueda,
    fechaDesde,
    fechaHasta,
    metodoPagoId,
    estado,
    aperturaCajaId,
    empresaId,
    sucursalId,
}) {
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
    if (aperturaCajaId !== undefined) condiciones.push({ aperturaCajaId });
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
    } else if (estado === 'pendiente_pago') {
        condiciones.push({ estado: 'pendiente_pago' });
    } else if (estado === 'reembolsado') {
        condiciones.push({
            transaccionesPago: {
                some: {
                    estado: 'REEMBOLSADO',
                    deletedAt: null,
                },
            },
        });
    }

    const where = this.aplicarContextoVenta({ AND: condiciones }, empresaId, sucursalId);
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
        detalleVenta: {
            select: {
                id: true,
                cantidad: true,
                subtotal: true,
                descripcion: true,
                tipoItem: true,
                producto: { select: { nombre: true } },
                servicio: { select: { nombre: true } },
                tipoMembresia: { select: { nombre: true } },
            },
        },
        devoluciones: {
            where: {
                estadoReembolso: { in: ['PENDIENTE_REEMBOLSO', 'COMPLETADA'] },
            },
            select: {
                id: true,
                estadoReembolso: true,
                detalles: {
                    select: { detalleVentaId: true, cantidad: true },
                },
            },
            orderBy: { id: 'desc' },
        },
        transaccionesPago: {
            where: { deletedAt: null },
            select: {
                id: true,
                proveedor: true,
                estado: true,
                monto: true,
                montoReembolsado: true,
                folioVoucher: true,
                referenciaExterna: true,
                createdAt: true,
            },
            orderBy: { id: 'desc' },
        },
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

async getById(id, clientOrEmpresaId = 1) {
    const client = clientOrEmpresaId && typeof clientOrEmpresaId === 'object'
        ? clientOrEmpresaId
        : this.prisma;
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
            transaccionesPago: {
                where: { deletedAt: null },
                select: {
                    id: true,
                    proveedor: true,
                    estado: true,
                    folioVoucher: true,
                    referenciaExterna: true,
                    monto: true,
                    montoReembolsado: true,
                    metadatos: true,
                },
            },
            devoluciones: {
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    createdAt: true,
                    monto: true,
                    motivo: true,
                    estadoReembolso: true,
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
                        where: {
                            devolucion: {
                                is: {
                                    estadoReembolso: {
                                        in: ['PENDIENTE_REEMBOLSO', 'COMPLETADA'],
                                    },
                                },
                            },
                        },
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
    const devolucionesCompletadas = venta.devoluciones.filter(
        (devolucion) => devolucion.estadoReembolso === 'COMPLETADA'
    );
    const devolucionesPendientes = venta.devoluciones.filter(
        (devolucion) => devolucion.estadoReembolso === 'PENDIENTE_REEMBOLSO'
    );
    const totalDevuelto = devolucionesCompletadas.reduce(
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
    const estadoDevolucion = devolucionesPendientes.length > 0
        ? 'REEMBOLSO_PENDIENTE'
        : cantidadDevuelta === 0
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
            cantidadDevolucionesCompletadas: devolucionesCompletadas.length,
            cantidadDevolucionesPendientes: devolucionesPendientes.length,
            cantidadDevolucionesFallidas: venta.devoluciones.filter(
                (devolucion) => devolucion.estadoReembolso === 'FALLIDA'
            ).length,
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

async expirarVentaPendientePago(ventaId, fechaActual = new Date()) {
    return this.prisma.$transaction((tx) =>
        this.expirarVentaPendientePagoEnTx(tx, ventaId, fechaActual)
    );
}

async expirarVentasDigitalesPendientes(ventaId = null) {
    const candidatas = await this.prisma.transaccionPago.findMany({
        where: {
            proveedor: 'MERCADO_PAGO',
            estado: { in: ['PENDIENTE', 'RECHAZADO'] },
            deletedAt: null,
            venta: {
                is: {
                    ...(ventaId == null ? {} : { id: Number(ventaId) }),
                    estado: 'pendiente_pago',
                    deletedAt: null,
                },
            },
        },
        select: {
            ventaId: true,
            createdAt: true,
            metadatos: true,
        },
        orderBy: { id: 'asc' },
        take: 500,
    });
    const ahora = new Date();
    let expiradas = 0;

    for (const transaccion of candidatas) {
        const venceEn = new Date(
            transaccion.metadatos?.expiresAt
                ?? pagoService.obtenerExpiracionPagoDigital(transaccion.createdAt)
        );
        if (venceEn > ahora) continue;
        if (await this.expirarVentaPendientePago(transaccion.ventaId, ahora)) expiradas += 1;
    }

    return expiradas;
}

async expirarPagosPendientesEnApertura(tx, aperturaCajaId, fechaActual = new Date()) {
    const candidatas = await tx.transaccionPago.findMany({
        where: {
            proveedor: 'MERCADO_PAGO',
            estado: { in: ['PENDIENTE', 'RECHAZADO'] },
            deletedAt: null,
            venta: {
                is: {
                    aperturaCajaId: Number(aperturaCajaId),
                    estado: 'pendiente_pago',
                    deletedAt: null,
                },
            },
        },
        select: {
            ventaId: true,
            createdAt: true,
            metadatos: true,
        },
    });
    let expiradas = 0;
    for (const transaccion of candidatas) {
        const venceEn = new Date(
            transaccion.metadatos?.expiresAt
                ?? pagoService.obtenerExpiracionPagoDigital(transaccion.createdAt)
        );
        if (venceEn <= fechaActual
            && await this.expirarVentaPendientePagoEnTx(tx, transaccion.ventaId, fechaActual)) {
            expiradas += 1;
        }
    }
    return expiradas;
}

async expirarVentaPendientePagoEnTx(tx, ventaId, fechaActual = new Date()) {
    const referencia = await tx.venta.findFirst({
        where: { id: Number(ventaId), deletedAt: null },
        select: { id: true, aperturaCajaId: true },
    });
    if (!referencia || !referencia.aperturaCajaId) return false;

    await tx.$queryRaw`
        SELECT id
        FROM aperturas_caja
        WHERE id = ${referencia.aperturaCajaId}
        FOR UPDATE
    `;
    const ventasBloqueadas = await tx.$queryRaw`
        SELECT id
        FROM venta
        WHERE id = ${Number(ventaId)} AND deleted_at IS NULL
        FOR UPDATE
    `;
    if (ventasBloqueadas.length === 0) return false;

    const venta = await tx.venta.findFirst({
        where: { id: Number(ventaId), deletedAt: null },
        include: {
            detalleVenta: true,
            transaccionesPago: {
                where: { proveedor: 'MERCADO_PAGO', deletedAt: null },
                orderBy: { id: 'desc' },
                take: 1,
            },
        },
    });
    const transaccion = venta?.transaccionesPago[0];
    if (
        venta?.estado !== 'pendiente_pago'
        || !transaccion
        || transaccion.estado === 'APROBADO'
    ) return false;

    const venceEn = new Date(
        transaccion.metadatos?.expiresAt
            ?? pagoService.obtenerExpiracionPagoDigital(transaccion.createdAt)
    );
    if (venceEn > fechaActual) return false;

    await this.ajustarStock(tx, venta.detalleVenta, []);
    await tx.venta.update({
        where: { id: venta.id },
        data: {
            estado: 'cancelada',
            motivoCancelacion: 'Pago no completado: venció el enlace de Mercado Pago',
        },
    });
    await tx.transaccionPago.update({
        where: { id: transaccion.id },
        data: {
            estado: 'EXPIRADO',
            datosRespuesta: JSON.stringify({
                motivo: 'La venta venció sin confirmación de pago.',
                expiradoEn: fechaActual.toISOString(),
            }),
        },
    });
    return true;
}

async resolverPagoMercadoPago(paymentData, empresaId = null) {
    const externalReference = paymentData?.external_reference;
    if (typeof externalReference !== 'string' || !externalReference) {
        throw Object.assign(new Error('El pago no tiene referencia externa de venta.'), { status: 400 });
    }

    const transaccionInicial = await this.prisma.transaccionPago.findFirst({
        where: {
            uuidIdempotencia: externalReference,
            proveedor: 'MERCADO_PAGO',
            deletedAt: null,
            ...(empresaId == null ? {} : { empresaId: Number(empresaId) }),
        },
        select: {
            id: true,
            ventaId: true,
            empresaId: true,
            monto: true,
        },
    });
    if (!transaccionInicial || transaccionInicial.ventaId == null) {
        throw Object.assign(new Error('No existe una venta asociada a este pago de Mercado Pago.'), { status: 404 });
    }
    if (
        !Number.isFinite(Number(paymentData.transaction_amount))
        || currency(Number(paymentData.transaction_amount)).intValue
            !== currency(Number(transaccionInicial.monto)).intValue
        || paymentData.currency_id !== 'MXN'
    ) {
        throw Object.assign(new Error('El monto o la moneda del pago no coincide con la venta.'), { status: 409 });
    }

    return this.prisma.$transaction(async (tx) => {
        const referenciaVenta = await tx.venta.findFirst({
            where: { id: transaccionInicial.ventaId, deletedAt: null },
            select: { id: true, aperturaCajaId: true },
        });
        if (!referenciaVenta) {
            throw Object.assign(new Error('La venta asociada al pago ya no existe.'), { status: 404 });
        }
        if (referenciaVenta.aperturaCajaId) {
            await tx.$queryRaw`
                SELECT id
                FROM aperturas_caja
                WHERE id = ${referenciaVenta.aperturaCajaId}
                FOR UPDATE
            `;
        }
        const ventaBloqueada = await tx.$queryRaw`
            SELECT id
            FROM venta
            WHERE id = ${transaccionInicial.ventaId} AND deleted_at IS NULL
            FOR UPDATE
        `;
        await tx.$queryRaw`
            SELECT id
            FROM transacciones_pagos
            WHERE id = ${transaccionInicial.id}
            FOR UPDATE
        `;

        const [venta, transaccion] = await Promise.all([
            tx.venta.findUnique({
                where: { id: transaccionInicial.ventaId },
                include: { detalleVenta: true },
            }),
            tx.transaccionPago.findUnique({ where: { id: transaccionInicial.id } }),
        ]);
        if (ventaBloqueada.length === 0 || !venta || !transaccion) {
            throw Object.assign(new Error('La venta o transacción de pago ya no existe.'), { status: 404 });
        }

        const estadoMP = paymentData.status;
        const resumenMP = {
            paymentId: String(paymentData.id),
            status: estadoMP,
            statusDetail: paymentData.status_detail ?? null,
            amount: Number(paymentData.transaction_amount),
            currency: paymentData.currency_id,
            paymentMethod: paymentData.payment_method_id ?? null,
            dateApproved: paymentData.date_approved ?? null,
        };
        const metadataActual = transaccion.metadatos && typeof transaccion.metadatos === 'object'
            ? transaccion.metadatos
            : {};
        const estadoVenta = String(venta.estado ?? '').toLowerCase();
        const venceEn = new Date(
            metadataActual.expiresAt
                ?? pagoService.obtenerExpiracionPagoDigital(transaccion.createdAt)
        );
        const aprobado = estadoMP === 'approved';
        const rechazado = ['rejected', 'cancelled'].includes(estadoMP);

        if (estadoVenta === 'completada' || estadoVenta === 'completado') {
            if (aprobado && !['APROBADO', 'REEMBOLSADO'].includes(transaccion.estado)) {
                await tx.transaccionPago.update({
                    where: { id: transaccion.id },
                    data: {
                        estado: 'APROBADO',
                        datosRespuesta: JSON.stringify(resumenMP),
                    },
                });
            }
            return { procesado: false, estado: transaccion.estado };
        }

        if (estadoVenta !== 'pendiente_pago') {
            if (aprobado && transaccion.estado !== 'REEMBOLSADO') {
                await tx.transaccionPago.update({
                    where: { id: transaccion.id },
                    data: {
                        estado: 'APROBADO',
                        metadatos: {
                            ...metadataActual,
                            requiereReembolsoManual: true,
                            pagoHuerfano: true,
                        },
                        datosRespuesta: JSON.stringify(resumenMP),
                    },
                });
                return { procesado: false, estado: 'APROBADO_HUERFANO' };
            }
            return { procesado: false, estado: transaccion.estado };
        }

        if (venceEn <= new Date()) {
            await this.ajustarStock(tx, venta.detalleVenta, []);
            await tx.venta.update({
                where: { id: venta.id },
                data: {
                    estado: 'cancelada',
                    motivoCancelacion: 'Pago no completado: venció el enlace de Mercado Pago',
                },
            });
            await tx.transaccionPago.update({
                where: { id: transaccion.id },
                data: {
                    estado: aprobado ? 'APROBADO' : 'EXPIRADO',
                    metadatos: {
                        ...metadataActual,
                        ...(aprobado ? {
                            requiereReembolsoManual: true,
                            pagoHuerfano: true,
                        } : {}),
                    },
                    datosRespuesta: JSON.stringify({
                        ...resumenMP,
                        ...(aprobado ? { requiereReembolsoManual: true } : {}),
                    }),
                },
            });
            return { procesado: true, estado: aprobado ? 'APROBADO_HUERFANO' : 'EXPIRADO' };
        }

        if (aprobado) {
            await tx.transaccionPago.update({
                where: { id: transaccion.id },
                data: {
                    estado: 'APROBADO',
                    datosRespuesta: JSON.stringify(resumenMP),
                },
            });
            await tx.venta.update({
                where: { id: venta.id },
                data: { estado: ESTADO_VENTA.COMPLETADA },
            });
            await this.activarMembresiasDeVenta(tx, venta.id, venta.clienteId, {
                empresaId: Number(transaccion.empresaId),
                sucursalId: Number(transaccion.sucursalId),
            });
            if (referenciaVenta.aperturaCajaId) {
                await pagoService.registrarMovimientoCobro(tx, {
                    empresaId: Number(transaccion.empresaId),
                    sucursalId: Number(transaccion.sucursalId),
                    aperturaCajaId: Number(referenciaVenta.aperturaCajaId),
                    empleadoId: Number(venta.empleadoId),
                    ventaId: Number(venta.id),
                    transaccionPagoId: transaccion.id,
                    monto: Number(transaccion.monto),
                    concepto: `Cobro Mercado Pago de venta #${venta.id}`,
                    proveedor: 'MERCADO_PAGO',
                    estado: 'VALIDADO',
                });
            }
            return { procesado: true, estado: 'APROBADO' };
        }

        const nuevoEstado = rechazado ? 'RECHAZADO' : 'PENDIENTE';
        await tx.transaccionPago.update({
            where: { id: transaccion.id },
            data: {
                estado: nuevoEstado,
                datosRespuesta: JSON.stringify(resumenMP),
            },
        });
        return { procesado: true, estado: nuevoEstado };
    }, { isolationLevel: 'ReadCommitted' });
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
        if (String(venta.estado ?? '').trim().toLowerCase() === 'pendiente_pago') continue;
        const totalItem = currency(venta.total);
        const esCancelada = ['cancelada', 'cancelado'].includes(String(venta.estado ?? '').trim().toLowerCase());
        const esEfectivo = venta.metodoPago?.codigo === 'EFECTIVO';

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
    };
}

async obtenerResumenHistorial({ aperturaCajaId, empresaId, sucursalId } = {}) {
    const idApertura = aperturaCajaId === undefined || aperturaCajaId === null
        ? undefined
        : Number(aperturaCajaId);
    if (
        idApertura !== undefined
        && (!Number.isSafeInteger(idApertura) || idApertura <= 0)
    ) {
        throw Object.assign(new Error('ID de apertura de caja no válido'), { status: 400 });
    }

    const filtroApertura = idApertura === undefined ? {} : { aperturaCajaId: idApertura };
    const whereVentas = this.aplicarContextoVenta({
        deletedAt: null,
        ...filtroApertura,
        estado: { in: ['completada', 'completado', 'completa'] },
    }, empresaId, sucursalId);
    const whereVentasCanceladas = this.aplicarContextoVenta({
        ...filtroApertura,
        estado: { in: ['cancelada', 'cancelado'] },
    }, empresaId, sucursalId);
    const whereMovimientos = this.aplicarFiltrosContexto({
        deletedAt: null,
        ...filtroApertura,
    }, empresaId, sucursalId);

    const [ventas, ventasCanceladas, reembolsos] = await Promise.all([
        this.prisma.venta.aggregate({
            where: whereVentas,
            _sum: { total: true },
        }),
        this.prisma.venta.aggregate({
            where: whereVentasCanceladas,
            _sum: { total: true },
        }),
        this.prisma.movimientoCaja.aggregate({
            where: {
                ...whereMovimientos,
                tipo: 'SALIDA',
                origen: { in: ['DEVOLUCION', 'CANCELACION'] },
                estado: 'VALIDADO',
            },
            _sum: { monto: true },
        }),
    ]);

    return {
        aperturaCajaId: idApertura ?? null,
        totalCobrado: Number(ventas._sum?.total ?? 0),
        totalCancelado: Number(ventasCanceladas._sum?.total ?? 0),
        totalReembolsado: Number(reembolsos._sum?.monto ?? 0),
    };
}

async create(data) {
    const {
        detalleVenta,
        empleadoId,
        clienteId,
        usuarioId,
        empresaId,
        uuidIdempotencia,
        subtotal: subtotalEnviado,
        total: totalEnviado,
        montoRecibido: montoRecibidoEnviado,
        pago = {},
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
    if (pago !== null && (typeof pago !== 'object' || Array.isArray(pago))) {
        const error = new Error('Los datos del cobro deben enviarse como un objeto');
        error.status = 400;
        throw error;
    }

    const metodoPagoSolicitado = await this.prisma.metodoPago.findFirst({
        where: {
            id: Number(restoDatos.metodoPagoId),
            estado: 'activo',
            deletedAt: null,
        },
        select: { codigo: true },
    });
    const esPagoMercadoPago = metodoPagoSolicitado?.codigo === 'MERCADO_PAGO';
    const hashSolicitud = esPagoMercadoPago
        ? crypto.createHash('sha256').update(JSON.stringify({
              aperturaCajaId,
              empleadoId: idEmpleado,
              clienteId: idCliente,
              metodoPagoId: Number(restoDatos.metodoPagoId),
              subtotal: Number(subtotalEnviado),
              total: Number(totalEnviado),
              detalleVenta,
          })).digest('hex')
        : null;

    if (esPagoMercadoPago && !uuidIdempotencia) {
        const error = new Error('Se requiere una llave de idempotencia para crear un checkout digital.');
        error.status = 400;
        throw error;
    }

    const recuperarVentaDigital = async (transaccion) => {
        if (
            !esPagoMercadoPago
            || transaccion.proveedor !== 'MERCADO_PAGO'
            || Number(transaccion.empresaId) !== Number(empresaId)
            || transaccion.metadatos?.requestHash !== hashSolicitud
        ) {
            const error = new Error('La llave de idempotencia ya se utilizó con otra solicitud.');
            error.status = 409;
            throw error;
        }
        const ventaExistente = await this.getById(transaccion.ventaId);
        if (!ventaExistente) {
            const error = new Error('No se encontró la venta asociada a la llave de idempotencia.');
            error.status = 409;
            throw error;
        }
        const pagoDigital = await pagoService.prepararCheckoutVenta(transaccion.ventaId, empresaId);
        return { ...ventaExistente, pagoDigital };
    };

    if (uuidIdempotencia) {
        const transaccionExistente = await this.prisma.transaccionPago.findUnique({
            where: { uuidIdempotencia },
        });
        if (transaccionExistente) return recuperarVentaDigital(transaccionExistente);
    }

    const resultado = await this.prisma.$transaction(async (tx) => {
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
            SELECT id, estado, empleado_id AS empleadoId,
                   empresa_id AS empresaId, sucursal_id AS sucursalId
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
        if (empresaId != null && Number(empresaId) !== Number(cajaAbierta.empresaId)) {
            const error = new Error('La apertura de caja no pertenece a la empresa del usuario.');
            error.status = 403;
            throw error;
        }

        if (uuidIdempotencia) {
            const transaccionConcurrente = await tx.transaccionPago.findUnique({
                where: { uuidIdempotencia },
            });
            if (transaccionConcurrente) {
                return { ventaId: transaccionConcurrente.ventaId, esPagoMercadoPago: true };
            }
        }

        const detalles = await this.prepararDetalles(
            tx,
            detalleVenta,
            [],
            {
                empresaId: Number(cajaAbierta.empresaId),
                sucursalId: Number(cajaAbierta.sucursalId),
            }
        );

        const { subtotal, total } = this.calcularTotal(detalles);
        this.validarMontos(
            { subtotal, total },
            { subtotal: subtotalEnviado, total: totalEnviado }
        );
        const esPagoEfectivo = metodoPago.codigo === 'EFECTIVO';
        const esDigital = metodoPago.codigo === 'MERCADO_PAGO';
        let efectivoAValidar = montoRecibidoEnviado;
        if (!efectivoAValidar || currency(efectivoAValidar).intValue < currency(total).intValue) {
            efectivoAValidar = total;
        }
        const montoRecibido = esDigital
            ? null
            : esPagoEfectivo
                ? this.validarMontoRecibido(efectivoAValidar, total)
                : total;
        const cambio = esPagoEfectivo
            ? currency(montoRecibido).subtract(total).value
            : 0;
        if (esDigital && total <= 0) {
            const error = new Error('El total debe ser mayor a cero para cobrar con Mercado Pago.');
            error.status = 400;
            throw error;
        }

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
                estado: esDigital ? 'pendiente_pago' : ESTADO_VENTA.COMPLETADA,
                detalleVenta: {
                    create: detalles,
                },
                folioVenta : { create : {} }
            },
            include : {folioVenta : true}
        });

        if (!esDigital) {
            await this.activarMembresiasDeVenta(tx, nuevaVenta.id, cliente.id, {
                empresaId: Number(cajaAbierta.empresaId),
                sucursalId: Number(cajaAbierta.sucursalId),
            });
        }

        const proveedor = Object.prototype.hasOwnProperty.call(
            PROVEEDOR_POR_CODIGO_METODO,
            metodoPago.codigo
        )
            ? PROVEEDOR_POR_CODIGO_METODO[metodoPago.codigo]
            : null;
        if (proveedor) {
            await pagoService.registrarCobroVenta(tx, {
                ...pago,
                referenciaTransferencia: pago?.referenciaTransferencia ?? pago?.referencia,
                empresaId: Number(cajaAbierta.empresaId),
                sucursalId: Number(cajaAbierta.sucursalId),
                aperturaCajaId: Number(cajaAbierta.id),
                empleadoId: Number(cajaAbierta.empleadoId),
                ventaId: nuevaVenta.id,
                folioVenta: nuevaVenta.folioVenta.id,
                proveedor,
                monto: total,
                uuidIdempotencia: uuidIdempotencia ?? null,
                efectivoRecibido: montoRecibido,
                cambio,
            });
        }

        if (esDigital) {
            await pagoService.registrarCobroDigitalVenta(tx, {
                empresaId: Number(cajaAbierta.empresaId),
                sucursalId: Number(cajaAbierta.sucursalId),
                aperturaCajaId: Number(cajaAbierta.id),
                empleadoId: Number(cajaAbierta.empleadoId),
                ventaId: nuevaVenta.id,
                folioVenta: nuevaVenta.folioVenta.id,
                monto: total,
                correoCliente: pago?.correoCliente ?? null,
                uuidIdempotencia,
                requestHash: hashSolicitud,
            });
        }

        await this.ajustarStock(tx, [], detalles);

        return { ventaId: nuevaVenta.id, esPagoMercadoPago: esDigital };
    });

    if (resultado.esPagoMercadoPago) {
        const venta = await this.getById(resultado.ventaId);
        const pagoDigital = await pagoService.prepararCheckoutVenta(resultado.ventaId, empresaId);
        return { ...venta, pagoDigital };
    }
    return this.getById(resultado.ventaId);
}

async cancel(id, motivoCancelacion, {
    folioCancelacion = null,
    confirmacionTerminal = false,
} = {}) {
    const ventaId = this.validarId(id, 'la venta');
    const motivo = typeof motivoCancelacion === 'string' ? motivoCancelacion.trim() : '';
    if (!motivo || motivo.length > 500) {
        throw Object.assign(new Error('El motivo de cancelación es obligatorio y no debe exceder 500 caracteres.'), { status: 400 });
    }

    const preparada = await this.prisma.$transaction(async (tx) => {
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
            SELECT id, estado, empresa_id AS empresaId,
                   sucursal_id AS sucursalId, empleado_id AS empleadoId
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
                    select: { id: true, codigo: true, nombre: true },
                },
                transaccionesPago: {
                    where: {
                        deletedAt: null,
                    },
                    orderBy: { id: 'desc' },
                    select: {
                        id: true,
                        proveedor: true,
                        estado: true,
                        monto: true,
                        montoReembolsado: true,
                        metadatos: true,
                    },
                },
                folioVenta: {
                    select: { id: true },
                },
            },
        });

        if (venta.estado === ESTADO_VENTA.CANCELADA) {
            throw new Error('La venta ya está cancelada');
        }

        const pagoMercadoPago = venta.transaccionesPago.find(
            (transaccion) => transaccion.proveedor === 'MERCADO_PAGO'
        );
        if (venta.estado === 'pendiente_pago') {
            await this.ajustarStock(tx, venta.detalleVenta, []);
            if (pagoMercadoPago) {
            const metadatos = pagoMercadoPago.metadatos && typeof pagoMercadoPago.metadatos === 'object'
                ? pagoMercadoPago.metadatos
                : {};
            await tx.transaccionPago.update({
                where: { id: pagoMercadoPago.id },
                data: {
                    estado: 'EXPIRADO',
                    metadatos: { ...metadatos, canceladoManualmente: true },
                    datosRespuesta: JSON.stringify({ motivoCancelacion }),
                },
            });
            }

            return {
                respuesta: await tx.venta.update({
                    where: { id: ventaId },
                    data: {
                        estado: ESTADO_VENTA.CANCELADA,
                        motivoCancelacion: motivo,
                    },
                    omit: this.omit,
                }),
            };
        }

        const ventaCompletada = ['completada', 'completado']
            .includes(String(venta.estado ?? '').toLowerCase());
        if (!ventaCompletada) {
            throw Object.assign(new Error('Solo se pueden cancelar ventas completadas o pagos pendientes.'), { status: 409 });
        }

        const devolucionesActivas = await tx.devolucion.findMany({
            where: {
                ventaId,
                estadoReembolso: { in: ['PENDIENTE_REEMBOLSO', 'COMPLETADA'] },
            },
            select: {
                estadoReembolso: true,
                detalles: {
                    select: {
                        detalleVentaId: true,
                        cantidad: true,
                    },
                },
            },
        });
        if (devolucionesActivas.some((devolucion) => (
            devolucion.estadoReembolso === 'PENDIENTE_REEMBOLSO'
            && devolucion.detalles.length > 0
        ))) {
            throw Object.assign(
                new Error('Hay una devolución pendiente de confirmación para esta venta.'),
                { status: 409 }
            );
        }

        const { estaTotalmenteDevuelta, detallesStock } = prepararCancelacionConDevoluciones(
            venta.detalleVenta,
            devolucionesActivas
        );
        if (estaTotalmenteDevuelta) {
            throw Object.assign(
                new Error('No se puede cancelar una venta que ya fue devuelta completamente.'),
                { status: 409, code: 'VENTA_TOTALMENTE_DEVUELTA' }
            );
        }

        const devolucionPendiente = await tx.devolucion.findFirst({
            where: {
                ventaId,
                estadoReembolso: 'PENDIENTE_REEMBOLSO',
                detalles: { none: {} },
            },
        });
        if (devolucionPendiente) {
            throw Object.assign(
                new Error('Esta cancelación quedó pendiente de conciliación. Verifica si el cliente ya recibió el dinero antes de entregar efectivo.'),
                { status: 409, code: 'REEMBOLSO_PENDIENTE_CONCILIACION' }
            );
        }
        const transaccionPago = venta.transaccionesPago.find(
            (transaccion) => transaccion.estado === 'APROBADO'
        );
        if (!transaccionPago) {
            throw Object.assign(new Error('No se encontró un pago aprobado asociado a la venta.'), { status: 409 });
        }

        const montoReembolsado = Math.round(Number(transaccionPago.montoReembolsado ?? 0) * 100);
        const montoTransaccion = Math.round(Number(transaccionPago.monto) * 100);
        const monto = (montoTransaccion - montoReembolsado) / 100;
        if (monto <= 0) {
            throw Object.assign(new Error('La transacción ya está reembolsada por completo.'), { status: 409 });
        }
        if (Math.round(monto * 100) > montoTransaccion - montoReembolsado) {
            throw Object.assign(new Error('El reembolso excede el monto total de la transacción.'), { status: 409 });
        }

        const validacionPago = await validarReembolso(tx, {
            ventaId,
            metodoPago: venta.metodoPago,
            transaccionPago,
            monto,
            folioCancelacion,
            confirmacionTerminal,
        });
        const metodoPagoReembolso = validacionPago.metodoPagoReembolso ?? venta.metodoPago;

        const reembolso = await tx.devolucion.create({
            data: {
                ventaId,
                aperturaCajaId: Number(caja.id),
                empleadoId: Number(venta.empleadoId),
                metodoPagoId: Number(metodoPagoReembolso.id),
                monto,
                motivo,
                estadoReembolso: 'PENDIENTE_REEMBOLSO',
                folioCancelacion: folioCancelacion?.trim() || null,
            },
        });

        await completarReembolso(tx, {
            devolucionId: reembolso.id,
            ventaId,
            apertura: caja,
            metodoPago: venta.metodoPago,
            metodoPagoReembolso,
            transaccionPago,
            monto,
            folioCancelacion,
            detallesStock,
            cancelacion: { motivo },
            origenMovimiento: 'CANCELACION',
            conceptoMovimiento: `Cancelación de venta folio ${venta.folioVenta?.id ?? venta.id} (reembolso en ${metodoPagoReembolso.nombre || metodoPagoReembolso.codigo})`,
        });
        return tx.venta.findUnique({
            where: { id: ventaId },
            omit: this.omit,
        });
    }, { isolationLevel: 'ReadCommitted' });
    return preparada;
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


async prepararDetalles(tx, items, detallesViejos = [], contexto = {}) {
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
        let almacenId = null;
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
                        empresaId: contexto.empresaId,
                        sucursalId: contexto.sucursalId,
                        estado: { in: ESTADOS_ACTIVOS_CATALOGO },
                        disponibleCompra: true,
                        deletedAt: null,
                    },
                });

                if (!registro) {
                    throw crearErrorArticuloNoDisponible(
                        `El producto ${productoId} no existe, está inactivo o no está disponible para venta`
                    );
                }

                const anterior = detallesAnteriores.get(productoId);
                if (item.almacenId !== undefined && item.almacenId !== null && item.almacenId !== '') {
                    const idAlmacen = this.validarId(item.almacenId, 'el almacén');
                    if (typeof tx.almacen?.findFirst === 'function') {
                        const almacen = await tx.almacen.findFirst({
                            where: {
                                id: idAlmacen,
                                empresaId: contexto.empresaId,
                                sucursalId: contexto.sucursalId,
                                activo: true,
                                deletedAt: null,
                            },
                            select: { id: true },
                        });
                        if (!almacen) {
                            throw crearErrorArticuloNoDisponible(
                                `El almacén ${idAlmacen} no existe o no está disponible en esta sucursal`
                            );
                        }
                    }
                    almacenId = idAlmacen;
                } else if (anterior?.almacenId) {
                    almacenId = anterior.almacenId;
                }

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

                registro = await tx.servicio.findFirst({
                    where: {
                        id: servicioId,
                        empresaId: contexto.empresaId,
                        sucursalId: contexto.sucursalId,
                        estado: { in: ESTADOS_ACTIVOS_CATALOGO },
                        disponibleCompra: true,
                        deletedAt: null,
                    },
                });

                if (!registro) {
                    throw crearErrorArticuloNoDisponible(
                        `El servicio ${servicioId} no existe, está inactivo o no está disponible para venta`
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

                registro = await tx.tipoMembresia.findFirst({
                    where: {
                        id: tipoMembresiaId,
                        empresaId: contexto.empresaId,
                        sucursalId: contexto.sucursalId,
                        estado: { in: ESTADOS_ACTIVOS_CATALOGO },
                        deletedAt: null,
                    },
                });

                if (!registro) {
                    throw crearErrorArticuloNoDisponible(
                        `El tipo de membresía ${tipoMembresiaId} no existe o está inactivo`
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
            ...(almacenId ? { almacenId } : {}),
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

    const sumarPorProducto = (lista) => {
        const mapa = new Map();
        for (const d of lista) {
            const prodId = Number(d.productoId);
            mapa.set(prodId, (mapa.get(prodId) ?? 0) + Number(d.cantidad ?? 0));
        }
        return mapa;
    };

    const stockAnterior = sumarPorProducto(anteriores);
    const stockNuevo = sumarPorProducto(nuevos);

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

    if (typeof tx.inventarioAlmacen?.findMany !== 'function') {
        return;
    }

    const deltasAlmacen = new Map();
    const acumularAlmacen = (lista, signo) => {
        for (const d of lista) {
            const prodId = Number(d.productoId);
            const almId = d.almacenId ? Number(d.almacenId) : null;
            const clave = `${prodId}:${almId ?? ''}`;
            const previo = deltasAlmacen.get(clave) ?? { productoId: prodId, almacenId: almId, delta: 0 };
            previo.delta += signo * Number(d.cantidad ?? 0);
            deltasAlmacen.set(clave, previo);
        }
    };
    acumularAlmacen(nuevos, 1);
    acumularAlmacen(anteriores, -1);

    for (const { productoId, almacenId, delta } of deltasAlmacen.values()) {
        if (delta === 0) continue;

        const inventarios = await tx.inventarioAlmacen.findMany({
            where: {
                productoId,
                deletedAt: null,
                almacen: { deletedAt: null, activo: true },
            },
            include: {
                almacen: { select: { id: true, esPrincipal: true, empresaId: true, sucursalId: true } },
            },
            orderBy: [{ almacen: { esPrincipal: 'desc' } }, { id: 'asc' }],
        });

        if (inventarios.length === 0 && !almacenId) {
            continue;
        }

        if (delta > 0) {
            if (almacenId) {
                const resAlmacen = await tx.inventarioAlmacen.updateMany({
                    where: {
                        almacenId,
                        productoId,
                        deletedAt: null,
                        stockActual: { gte: delta },
                    },
                    data: { stockActual: { decrement: delta } },
                });
                if (resAlmacen.count === 0) {
                    throw new Error(
                        `Stock insuficiente en el almacén seleccionado para el producto ${productoId}`
                    );
                }
            } else {
                let restante = delta;
                for (const inv of inventarios) {
                    if (restante <= 0) break;
                    const disponible = Math.max(0, Number(inv.stockActual ?? 0));
                    const tomar = Math.min(restante, disponible);
                    if (tomar <= 0) continue;
                    const resInv = await tx.inventarioAlmacen.updateMany({
                        where: { id: inv.id, deletedAt: null, stockActual: { gte: tomar } },
                        data: { stockActual: { decrement: tomar } },
                    });
                    if (resInv.count > 0) {
                        restante -= tomar;
                    }
                }
            }
        } else {
            const cantidadDevolver = -delta;
            const objetivo = almacenId
                ? inventarios.find((inv) => inv.almacenId === almacenId)
                : (inventarios.find((inv) => inv.almacen?.esPrincipal) ?? inventarios[0]);

            const targetAlmacenId = almacenId ?? objetivo?.almacenId ?? null;
            if (!targetAlmacenId) continue;

            if (objetivo) {
                await tx.inventarioAlmacen.update({
                    where: { id: objetivo.id },
                    data: { stockActual: { increment: cantidadDevolver } },
                });
            } else if (typeof tx.almacen?.findFirst === 'function' && typeof tx.inventarioAlmacen?.upsert === 'function') {
                const alm = await tx.almacen.findFirst({
                    where: { id: targetAlmacenId, deletedAt: null },
                    select: { id: true, empresaId: true, sucursalId: true },
                });
                if (alm) {
                    await tx.inventarioAlmacen.upsert({
                        where: {
                            almacenId_productoId: {
                                almacenId: alm.id,
                                productoId,
                            },
                        },
                        update: {
                            stockActual: { increment: cantidadDevolver },
                            deletedAt: null,
                        },
                        create: {
                            empresaId: alm.empresaId,
                            sucursalId: alm.sucursalId,
                            almacenId: alm.id,
                            productoId,
                            stockActual: cantidadDevolver,
                            stockMinimo: 1,
                        },
                    });
                }
            }
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
            // Si la app móvil o cliente envió el subtotal como total (sin desglosar IVA 16% en frontend),
            // se acepta y el servidor aplicará el total oficial con IVA calculado.
            if (coincide(calculados.subtotal, totalEnviado) || coincide(calculados.subtotal, subtotalEnviado)) {
                return;
            }
            throw new Error(
                `Los montos enviados no coinciden con el cálculo del servidor. Subtotal esperado: ${calculados.subtotal}, total esperado: ${calculados.total}`
            );
        }
    }

}

export const ventaDao = new VentaDao();
