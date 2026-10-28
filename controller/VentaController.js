
import { ventaDao } from '../dao/VentaDao.js';
import { BaseController } from './BaseController.js';

export class VentaController extends BaseController {
    constructor() {
        super(ventaDao);
    }

    create = async (req, res) => {
        try {
            const {
                aperturaCajaId,
                metodoPago,
                detalleVenta,
                subtotal,
                total,
            } = req.body;

            const clienteId = req.body.clienteId ?? req.body.clientId;

            this.validar(aperturaCajaId, clienteId, detalleVenta);

            const registro = await this.dao.create({
                usuarioId: req.usuario.id,
                aperturaCajaId: Number(aperturaCajaId),
                clienteId: Number(clienteId),
                subtotal: this.leerMonto(subtotal, 'subtotal'),
                total: this.leerMonto(total, 'total'),
                metodoPago: metodoPago
                    ? metodoPago.trim().toLowerCase()
                    : undefined,
                detalleVenta: this.normalizarDetalles(detalleVenta),
            });

            return this.respuestaExito(
                res,
                registro,
                'Venta creada correctamente'
            );
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    update = async (req, res) => {
        try {
            const id = this.leerId(req.params.id);
            const { metodoPago, descuento, detalleVenta } = req.body;

            const datos = {};

            if (metodoPago !== undefined) {
                datos.metodoPago = this.limpiarTexto(metodoPago);
            }
            
            if (detalleVenta !== undefined) {
                datos.detalleVenta = this.normalizarDetalles(detalleVenta);
            }

            if (Object.keys(datos).length === 0) {
                throw new Error('No hay campos para actualizar');
            }

            const registro = await this.dao.update(id, datos);

            return this.respuestaExito(
                res,
                registro,
                'Venta actualizada correctamente'
            );
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    cancel = async (req, res) => {
        try {
            const id = this.leerId(req.params.id);
            const respuesta = await this.dao.cancel(id);

            return this.respuestaExito(
                res,
                respuesta,
                'Se canceló la venta con éxito'
            );
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    limpiarTexto(valor) {
        if (valor === undefined || valor === null) {
            return undefined;
        }

        return String(valor).trim().toLowerCase();
    }
normalizarDetalles(detalleVenta) {
    if (!Array.isArray(detalleVenta)) {
        throw new Error("El detalle de la venta no es válido");
    }

    return detalleVenta.map((d) => {
        const tipoItem = String(d.tipoItem ?? "").trim().toUpperCase();
        const cantidad = Number(d.cantidad);

        if (!Number.isInteger(cantidad) || cantidad <= 0) {
            throw new Error("La cantidad debe ser un entero mayor que cero");
        }

        const precioUnitario = Number(d.precioUnitario);
        const subtotalLinea = Number(d.subtotal);

        if (d.precioUnitario === undefined || d.precioUnitario === null || d.precioUnitario === '' ||
            !Number.isFinite(precioUnitario) || precioUnitario < 0) {
            throw new Error("El precioUnitario es obligatorio y debe ser válido");
        }

        if (d.subtotal === undefined || d.subtotal === null || d.subtotal === '' ||
            !Number.isFinite(subtotalLinea) || subtotalLinea < 0) {
            throw new Error("El subtotal del artículo es obligatorio y debe ser válido");
        }

        const detalle = {
            tipoItem,
            cantidad,
            precioUnitario,
            subtotal: subtotalLinea,
            descripcion: d.descripcion ?? null,
            productoId: null,
            servicioId: null,
            tipoMembresiaId: null
        };

        switch (tipoItem) {
            case "PRODUCTO":
                detalle.productoId = Number(d.productoId);

                if (!Number.isInteger(detalle.productoId) || detalle.productoId <= 0) {
                    throw new Error("El productoId es obligatorio y debe ser válido");
                }
                break;

            case "SERVICIO":
                detalle.servicioId = Number(d.servicioId);

                if (!Number.isInteger(detalle.servicioId) || detalle.servicioId <= 0) {
                    throw new Error("El servicioId es obligatorio y debe ser válido");
                }
                break;

            case "MEMBRESIA":
                detalle.tipoMembresiaId = Number(d.tipoMembresiaId);

                if (!Number.isInteger(detalle.tipoMembresiaId) || detalle.tipoMembresiaId <= 0) {
                    throw new Error("El tipoMembresiaId es obligatorio y debe ser válido");
                }
                break;

            default:
                throw new Error(`Tipo de artículo no válido: ${tipoItem}`);
        }

        return detalle;
    });
}

    validar(aperturaCajaId, clienteId, detalleVenta) {
        const aperturaId = Number(aperturaCajaId);
        const idCliente = Number(clienteId);

        if (
            aperturaCajaId === undefined ||
            aperturaCajaId === null ||
            aperturaCajaId === '' ||
            !Number.isInteger(aperturaId) ||
            aperturaId <= 0
        ) {
            throw new Error('La apertura de caja es requerida');
        }

        if (
            clienteId === undefined ||
            clienteId === null ||
            clienteId === '' ||
            !Number.isInteger(idCliente) ||
            idCliente <= 0
        ) {
            throw new Error('El cliente es requerido');
        }

        if (!Array.isArray(detalleVenta) || detalleVenta.length === 0) {
            throw new Error(
                'La venta debe contener al menos un artículo'
            );
        }
    }

    leerId = (valor) => {
        const id = Number(valor);

        if (!Number.isInteger(id) || id <= 0) {
            const error = new Error(
                'El identificador de la venta no es válido'
            );
            error.status = 400;
            throw error;
        }

        return id;
    };

    leerMonto = (valor, nombre) => {
        const n = Number(valor);

        if (valor === undefined || valor === null || valor === '' || !Number.isFinite(n) || n < 0) {
            throw new Error(`El ${nombre} es requerido y debe ser un monto válido`);
        }

    return n;
};
}

export const ventaController = new VentaController();
