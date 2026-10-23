import {ventaDao} from '../dao/VentaDao.js'
import { BaseController } from './BaseController.js';

export class VentaController extends BaseController{

    constructor (){
        super(ventaDao);
    }
    
    create = async (req, res) => {

        try {

            const {aperturaCajaId, metodoPago, descuento, detalleVenta} = req.body;
            this.validar(aperturaCajaId,detalleVenta);
            const registro = await this.dao.create({
                usuarioId : req.usuario.id, 
                aperturaCajaId : Number(aperturaCajaId),
                metodoPago : metodoPago ? metodoPago.trim().toLowerCase() : undefined, 
                descuento : Number(descuento ?? 0),
                detalleVenta : this.normalizarDetalles(detalleVenta)});
            return this.respuestaExito(res,registro, 'Venta creada correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    }

    update = async (req, res) =>{
        
        try {
            const id = Number(req.params.id)
            const {metodoPago, descuento, detalleVenta}= req.body;
            const datos = {};
            if (metodoPago !== undefined) datos.metodoPago = this.limpiarTexto(metodoPago);
            if (descuento !== undefined) datos.descuento = Number(descuento);
            if (detalleVenta !== undefined) datos.detalleVenta = this.normalizarDetalles(detalleVenta);
            if(Object.keys(datos).length===0) throw new Error('No hay campos a  actualizar');
            const registro = await this.dao.update(id,datos);
            return this.respuestaExito(res, registro, 'Venta actualizada correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    }

    async cancel (req, res){
        try {
            const id = Number(req.params.id);
            const respuesta = await ventaDao.cancel(this.leerId(id));
            return this.respuestaExito(res, respuesta, 'Se cancelo la venta con exito');
        } catch (error) {
            return this.respuestaError(res,error);
        }
    }


    limpiarTexto(valor){
        if (valor === undefined || valor == null ){
            return undefined
        }
        return String(valor).trim().toLowerCase();
    }
    normalizarDetalles(detalleVenta){
        if(!Array.isArray(detalleVenta)) throw new Error( "El detalle de la venta no es valido");
        return detalleVenta.map((d) => ({
            productoId : Number(d.productoId),
            cantidad : Number(d.cantidad)
        }));
    }
    validar (aperturaCajaId,detalleVenta){
        if(aperturaCajaId === undefined || aperturaCajaId === null){
            throw new Error("La apertura de la caja es requerida");
        }
        if (!Array.isArray(detalleVenta) || detalleVenta.length === 0){
            throw new Error("El detalle de la venta no es valido");
        }
    }

    leerId = (valor) => {
        const id = Number(valor);
        if (!Number.isInteger(id) ||id<=0){
            const error = new Error("El identificador de la venta no es valido");
            error.status = 400;
            throw error;
        }
        return id;
    }

};
export const ventaController = new VentaController();
