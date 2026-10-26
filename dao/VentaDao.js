import { BaseDao } from "./BaseDao.js";
//dependecia que nos permite hacer movimientos y redondeo de dinero
import currency from "currency.js";

const ESTADO_CAJA = { ABIERTA: "ABIERTA", CERRADA: "CERRADA" };
const METODOS_PAGO = ["efectivo", "tarjeta", "transferencia"];
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
                }
            }
        );
    }

    async getAll() {
        return this.prisma.venta.findMany({
            where : { deletedAt : null },
            omit : this.omit,
            include : {
                cliente: {
                    select: {
                        id: true,
                        nombre: true,
                    },
                },
                aperturaCaja : {
                    select : {
                        id : true,
                        estado: true,
                        empleado: {
                        select: { id : true, nombre: true }
                        },
                        caja : {
                            select: {id : true, nombre : true}
                        }
                    }
                }
            },
            orderBy : {id: "desc"}
        });
    }

    async getById (id, client = this.prisma){
        const venta = await client.venta.findFirst({
            where : {id , deletedAt : null},
            omit : this.omit,
            include: {
                cliente: {
                    select: {
                        id: true,
                        nombre: true,
                    },
                },
                detalleVenta :{
                    include : {
                    productos : {
                        select : {id : true, nombre : true}
                    }
                }
                },
                aperturaCaja: {
                    select : {
                        id : true,
                        estado : true,
                        empleado : {select: {id : true, nombre : true}},
                    },
                }
            }
        });

        if (!venta) return null

        const {detalleVenta, ...v} = venta;

        return {
            ...v, detalles : detalleVenta.map(({productos, ...d}) => ({
                ...d,
                productoId: productos.id,
                productoNombre: productos.nombre
            })
                
            )
        }
    }

    async create(data) {

        const { detalleVenta, descuento = 0, clienteId,...restoDatos } = data;
        const aperturaCajaId = this.validarId(data.aperturaCajaId, "la apertura de caja");
        const usuarioId = this.validarId(data.usuarioId, "el usuario");
        const idCliente = this.validarId(clienteId, "el cliente");

        this.validarDetalles(detalleVenta)
        this.validarDescuento(descuento)
        if (data.metodoPago !== undefined) this.validarMetodoPago(restoDatos.metodoPago)

        return this.prisma.$transaction(async (tx) => {
            const empleado = await tx.empleado.findFirst({
                where: { usuarioId, deletedAt: null },
                select: { id: true },
            });
            const cliente = await tx.cliente.findFirst({
                where: {
                    id: idCliente,
                    deletedAt: null,
                },
                select: {
                    id: true,
                },
            });
            if (!cliente) throw new Error("El cliente no existe");
        
            if (!empleado) throw new Error("No hay un empleado asociado al usuario autenticado");

            const cajaAbierta = await tx.aperturaCaja.findFirst({where: {id: aperturaCajaId, empleadoId: empleado.id, estado: ESTADO_CAJA.ABIERTA, deletedAt: null }})

            if(!cajaAbierta) throw new Error("La apertura de la caja es necesaria")
            
            const detalles = await this.prepararDetalles(tx, detalleVenta, [])
            
            const {subtotal, total} =  this.calcularTotal(detalles,Number(descuento));
            //Suma de subtotales de esta manera sumamos todo en un recorrido de nuestra matriz detalles
            const nuevaVenta = await tx.venta.create({
                data: {
                    aperturaCajaId : cajaAbierta.id,
                    clientId: cliente.id,
                    metodoPago : restoDatos.metodoPago,
                    total : total,
                    subtotal : subtotal,
                    descuento : Number(descuento),
                    detalleVenta : {create : detalles},
                },
            });

            await this.ajustarStock(tx,[],detalles)
            return this.getById(nuevaVenta.id, tx);
        });
    }

async update(id, data) {
    const ventaId = this.validarId(id, "la venta");
    if (data.detalleVenta !== undefined) this.validarDetalles(data.detalleVenta);
    if (data.descuento !== undefined) this.validarDescuento(data.descuento);
    if (data.metodoPago !== undefined) this.validarMetodoPago(data.metodoPago);

    return this.prisma.$transaction(async (tx) => {
        const venta = await tx.venta.findFirst({
            where: { id: ventaId, deletedAt: null },
            include: { detalleVenta: true },
        });
        if (!venta) throw new Error("La venta no existe");
        if (venta.estado === ESTADO_VENTA.CANCELADA) {
            throw new Error("No se puede modificar una venta cancelada");
        }

        // La caja es la de la venta, no la que mande el frontend
        const caja = await tx.aperturaCaja.findFirst({
            where: { id: venta.aperturaCajaId, estado: ESTADO_CAJA.ABIERTA, deletedAt: null },
        });
        if (!caja) throw new Error("No se pudo actualizar: la caja de esta venta ya está cerrada");

        const items = data.detalleVenta
            ?? venta.detalleVenta.map((d) => ({ productoId: d.productoId, cantidad: d.cantidad }));
        const detalles = await this.prepararDetalles(tx, items, venta.detalleVenta);

        const descuento = data.descuento !== undefined ? Number(data.descuento) : Number(venta.descuento);
        const { subtotal, total } = this.calcularTotal(detalles, descuento);

        await tx.detalleVenta.deleteMany({ where: { ventaId } });
        await tx.venta.update({
            where: { id: ventaId },
            data: {
                subtotal,
                descuento,
                total,
                metodoPago: data.metodoPago ?? venta.metodoPago,
                detalleVenta: { create: detalles },
            },
        });

        await this.ajustarStock(tx, venta.detalleVenta, detalles);

        return this.getById(ventaId, tx);
    });
}

async cancel(id) {
    const ventaId = this.validarId(id, "la venta");

    return this.prisma.$transaction(async (tx) => {
        const venta = await tx.venta.findFirst({
            where: { id: ventaId, deletedAt: null },
            include: { detalleVenta: true },
        });
        if (!venta) throw new Error("La venta no existe");
        if (venta.estado === ESTADO_VENTA.CANCELADA) throw new Error("La venta ya está cancelada");

        const caja = await tx.aperturaCaja.findFirst({
            where: { id: venta.aperturaCajaId, estado: ESTADO_CAJA.ABIERTA, deletedAt: null },
        });
        if (!caja) throw new Error("No se puede cancelar: la caja de esta venta está cerrada");

        await this.ajustarStock(tx, venta.detalleVenta, []);   // devuelve todo el stock

        return tx.venta.update({
            where: { id: ventaId },
            data: { deletedAt: new Date(), estado: ESTADO_VENTA.CANCELADA },
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

    validarDetalles (detalleVenta){

        if (!Array.isArray(detalleVenta) || detalleVenta.length === 0 ) throw new Error("La venta deve de tener por lo menos un producto")

        const vistos = new Set();
        for (const item of detalleVenta){
            if (!Number.isInteger(item.productoId)) {
            throw new TypeError("Cada detalle necesita un producto válido");
        }
        if (!Number.isInteger(item.cantidad) || item.cantidad <= 0) {
            throw new Error("La cantidad debe ser un entero mayor a 0");
        }
        if (vistos.has(item.productoId)) {
            throw new Error(`El producto ${item.productoId} está repetido en la venta`);
        }
        vistos.add(item.productoId);
        }
    }

    validarDescuento (descuento){
        const d = Number(descuento);
        if ( d < 0|| d > 1 || Number.isNaN(d) ) throw new Error("Coloque un valor coherente para el descuento")
    }

    validarMetodoPago(metodoPago){
        if(!METODOS_PAGO.includes(metodoPago)){
            throw new Error("Metodo de pago no valido");
        }
    }

    // prepararDetalles ( transaction, detallesModificados, detalles viejos) 

    /**Esta funcion se encarga de comparar los cambios anteriores y actuales de nuestro stock para compararlos y solo modificar los capos necesarios para cada productro */
    async prepararDetalles (tx, items, detallesViejos = []){
        const detalles = [];
        //Traemos las ventas que ya tenia, indexando por producto
        const DetallesViejos = new Map(detallesViejos.map((d) => [d.productoId , d]));

        //Creamos un ciclo que permite comparar y cambiar los valores de modificados
        for ( const item of items){
            //Traemos los productos modificados indexando por el identificador del producto
            const producto = await tx.producto.findFirst({
                where : { id : item.productoId, deletedAt: null},
            });
            //En caso de no tener ningun producto modificado se le da un aviso
            if (!producto) throw new Error(`El producto ${item.productoId} no existe`);
            const Productoviejo = DetallesViejos.get(producto.id)
            const cantidadPrevia = Productoviejo?.cantidad ?? 0;

            const adicional = currency(item.cantidad).subtract(cantidadPrevia).value;
            //En caso de superar el stock actual informa del limite
            if (adicional > 0 && producto.stockActual < adicional){
                throw new Error(`Stock insuficiente de ${producto.id} solo disponible ${producto.stockActual}`);
            }
            
            //En caso de que se actualizara calcula el precio previo
            const precio = DetallesViejos.get(producto.id)?.precioUnitario ?? producto.precioVenta;

            detalles.push({
                productoId: producto.id,
                cantidad: item.cantidad,
                precioUnitario : precio,
                subtotal: currency(precio).multiply(item.cantidad).value,
            });
        }
        return detalles;
    }

    async ajustarStock (tx, detallesDetallesViejos, detallesNuevos){
        const DetallesViejos = new Map(detallesDetallesViejos.map((d) => [d.productoId, d.cantidad]));
        const nuevos = new Map(detallesNuevos.map((d) => [d.productoId , d.cantidad]));

        //justo todos los los productos de esta manera puedo manejar mis productos dentro del ciclo
        const ids = new Set([...DetallesViejos.keys(), ...nuevos.keys()]);

        for (const productoId of ids){

            //Traemos los distintos valores  
            const diferencia = (nuevos.get(productoId)?? 0) - ( DetallesViejos.get(productoId) ?? 0)
            if (diferencia > 0){
                const r = await tx.producto.updateMany({
                    where : { id : productoId,stockActual : {gte : diferencia},  deletedAt : null },
                    data : { stockActual : {decrement : diferencia} },
                });
                if (r.count === 0){
                    throw new Error(`Stock insuficiente para el producto ${productoId}`)
                }
            }else if (diferencia < 0){
                await tx.producto.update({
                    where : { id : productoId },
                    data : { stockActual : {increment : -diferencia} },
                });
            }
        }
    }
    //Permite hacer el calculo total de la venta
    calcularTotal (detalles, descuento) {
        //lo que hace es acumular la suma uno por uno y lo va sumando con acc se guarda trayendo cada detalle
        const subtotal = detalles.reduce((acc, d) => acc.add(d.subtotal), currency(0));
        const total = subtotal.subtract(subtotal.multiply(descuento))
        return {total : total.value, subtotal : subtotal.value}
    }
    
}

export const ventaDao = new VentaDao();
