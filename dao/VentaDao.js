import { BaseDao } from "./BaseDao.js";
//dependecia que nos permite hacer movimientos y redondeo de dinero
import currency from "currency.js";

const ESTADO_CAJA = { ABIERTA: "ABIERTA", CERRADA: "CERRADA" };
const ESTADO_VENTA = { COMPLETADA : "completada" , CANCELADA : "cancelada"}
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
                },
            },
        },
        orderBy: { id: 'desc' },
    });
}

async getById(id, client = this.prisma) {
    const venta = await client.venta.findFirst({
        where: {
            id: Number(id),
            deletedAt: null,
        },
        omit: this.omit,
        include: {
            cliente: {
                select: {
                    id: true,
                    nombre: true,
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
                },
            },
            detalleVenta: {
                include: {
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

    return {
        ...venta,
        detalleVenta: venta.detalleVenta.map((detalle) => ({
            ...detalle,
            articuloNombre:
                detalle.producto?.nombre ??
                detalle.servicio?.nombre ??
                detalle.tipoMembresia?.nombre ??
                detalle.descripcion,
        })),
    };
}

async create(data) {
    const {
        detalleVenta,
        clienteId,
        subtotal : subtotalEnviado,
        total : totalEnviado,
        ...restoDatos
    } = data;

    const aperturaCajaId = this.validarId(
        data.aperturaCajaId,
        'la apertura de caja'
    );

    const usuarioId = this.validarId(data.usuarioId, 'el usuario');
    const idCliente = this.validarId(clienteId, 'el cliente');

    this.validarDetalles(detalleVenta);

    return this.prisma.$transaction(async (tx) => {
        const empleado = await tx.empleado.findFirst({
            where: {
                usuarioId,
                deletedAt: null,
            },
            select: { id: true },
        });

        if (!empleado) {
            throw new Error(
                'No hay un empleado asociado al usuario autenticado'
            );
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

        const cajaAbierta = await tx.aperturaCaja.findFirst({
            where: {
                id: aperturaCajaId,
                empleadoId: empleado.id,
                estado: ESTADO_CAJA.ABIERTA,
                deletedAt: null,
            },
        });

        if (!cajaAbierta) {
            throw new Error('La apertura de caja no está disponible');
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

        const nuevaVenta = await tx.venta.create({
            data: {
                aperturaCaja: { connect: { id: cajaAbierta.id } },
                cliente: { connect: { id: cliente.id } },
                metodoPago: { connect: { id: metodoPago.id } },
                subtotal,
                total,
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
        this.validarDetalles(data.detalleVenta);
    }

    return this.prisma.$transaction(async (tx) => {
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

        const caja = await tx.aperturaCaja.findFirst({
            where: {
                id: venta.aperturaCajaId,
                estado: ESTADO_CAJA.ABIERTA,
                deletedAt: null,
            },
        });

        if (!caja) {
            throw new Error(
                'La caja de esta venta está cerrada'
            );
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
            {
                subtotal: data.subtotal ?? subtotal,
                total: data.total ?? total,
            }
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
    });
}
async cancel(id) {
    const ventaId = this.validarId(id, 'la venta');

    return this.prisma.$transaction(async (tx) => {
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
            throw new Error('La venta ya está cancelada');
        }

        const caja = await tx.aperturaCaja.findFirst({
            where: {
                id: venta.aperturaCajaId,
                estado: ESTADO_CAJA.ABIERTA,
                deletedAt: null,
            },
        });

        if (!caja) {
            throw new Error(
                'No se puede cancelar: la caja está cerrada'
            );
        }

        await this.ajustarStock(tx, venta.detalleVenta, []);

        return tx.venta.update({
            where: { id: ventaId },
            data: {
                deletedAt: new Date(),
                estado: ESTADO_VENTA.CANCELADA,
            },
            omit: this.omit,
        });
    });
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
            select: { id: true },
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

        const subtotalLinea = currency(precio).multiply(cantidad).value
        const nombre = registro.nombre ?? tipoItem

        if (item.precioUnitario = undefined){
            if(currency(item.precioUnitario.intValue !== currency(precio).intValue)){
                throw new Error(`Precio es de ${nombre} no coincide el precio actual ${precio}, enviado : ${item.precioUnitario}`)
            }
            if (currency(item.subtotal).intValue !== currency(subtotalLinea).intValue) {
            throw new Error(
                `El subtotal de "${nombre}" no coincide con ${cantidad} x ${precio} = ${subtotalLinea}`
            );  
            }
        }

        detalles.push({
            tipoItem,
            productoId,
            servicioId,
            tipoMembresiaId,
            clienteMembresiaId: null,
            descripcion: item.descripcion ?? registro.nombre ?? null,
            cantidad,
            precioUnitario: precio,
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
        const iva = subtotal.multiply(0.16);
        const total = subtotal.add(iva);
        return { subtotal: subtotal.value, total: total.value };
    }
    
    validarMontos(calculados, enviados) {
        const coincide = (a, b) => currency(a).intValue === currency(b).intValue;

        if (
            !coincide(calculados.subtotal, enviados.subtotal) ||
            !coincide(calculados.total, enviados.total)
        ) {
            throw new Error(
                `Los montos no coinciden. Subtotal: ${calculados.subtotal}, total: ${calculados.total}`
            );
        }
    }
    
}

export const ventaDao = new VentaDao();
