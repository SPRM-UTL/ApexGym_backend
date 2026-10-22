import {ventaDao} from '../dao/VentaDao.js'

const leerId = (valor) => {
    const id = Number(valor)
    if (!Number.isInteger(id) ||id<=0){
        const error = new Error("El identificador de la venta no es valido");
        error.status = 400;
        throw error;
    }
    return id;
}


export class ventaController extends BaseController{

    constructor (){
        super(ventaDao);
    }

    async create (req, res){
        const {aperturaCajaId, metodoPago, descuento, detalleVenta} = req.body();
        try {
            const registro = await this.dao.create({
                usuarioId : req.user.id, 
                aperturaCajaId : Number(aperturaCajaId),
                metodoPago : metodoPago ? metodoPago.trim().toLowerCase() : undefined, 
                descuento : Number(descuento ?? 0),
                detalleVenta : this.normalizarDetalles(detalleVenta)})
            return this.respuestaExito(res,registro, 'Venta creada correctamente')
        } catch (error) {
            return this.respuestaError(res, error)
        }
    }

    actualizar = async (res, req) =>{
        
        try {
            const id = Number(req.params.id)
            const {metodoPago, descuento, detalleVenta}= res.body;
            const datos = {};
            if (metodoPago !== undefined) datos.metodoPago = this.limpiarTexto(metodoPago);
            if (descuento !== undefined) datos.descuento = Number(descuento);
            if (detalleVenta !== undefined) datos.detalleVenta = this.normalizarDetalles(detalleVenta);
            if(Object.keys(datos).length===0) throw new Error('No hay campos a  actualizar')
            const registro = await this.dao.update(id,datos)
            return this.respuestaExito(res, registro, 'Venta actualizada correctamente')
        } catch (error) {
            return this.respuestaError(res, error)
        }
    }

    async cancel (req, res){
        try {
            const id = Number(req.params.id)
            const respuesta = await ventaDao.delete(leerId(id));
            return this.respuestaExito(res, respuesta, 'Se cancelo la venta con exito')
        } catch (error) {
            return this.respuestaError(res,error)
        }
    }


    limpiarTexto(valor){
        if (valor === undefined || valor == null ){
            return String(valor)
        }
    }
};

export const ventaController = new ventaController();