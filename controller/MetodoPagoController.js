import { metodoPagoDao } from "../dao/MetodoPagoDao.js";
import { BaseController } from "./BaseController.js";

export class MetodoPagoController extends BaseController{
    constructor(){
        super(metodoPagoDao);
    }

    crear = async(req,res)=>{
        const {
            nombre, 
            descripcion
        } = req.body;
        try{
            const metodoAgregado = await metodoPagoDao.create({
                nombre:nombre,
                descripcion:descripcion || null
            });
            return this.respuestaExito(res,metodoAgregado,"Metodo de pago añadido correctamente.")

        }catch(error){
            return this.respuestaError(res,error);
        }
    }

    actualizar = async(req,res) =>{
        const id = Number(req.params.id);
        const {
            nombre,
            descripcion
        } = req.body;
        try{ 
                const metodoActualizado = await metodoPagoDao.update(id,{
                nombre:nombre, descripcion:descripcion || null
            });
            return this.respuestaExito(res,metodoActualizado,"El método de pago fue actualizado correctamente.");
        }
        catch(error){
            return this.respuestaError(res,error)
        }
    }

    eliminar = async(req,res)=>{
       const id = Number(req.params.id);
        try{
            const metodoEliminado = await metodoPagoDao.delete(id);
            return this.respuestaExito(res,metodoEliminado,"El método de pago fue eliminado exitosamente.");
        }catch(error){
            return this.respuestaError(res,error)
        }
    }

}