import { ResponseModel } from '../modelos/ResponseModel.js';

export class BaseController {
    constructor(dao) {
        this.statusOk = 200;
        this.statusError = 500;
        this.statusNotFound = 404;

        this.dao = dao;
    }

    obtenerTodos = async (req, res) => {
        try {
            const usuarios = await this.dao.getAll();
            if (!usuarios) {
                throw new Error("No se encontraron registros");
            }

            return this.respuestaExito(res, usuarios, "Registros obtenidos exitosamente");

        } catch (error) {
            return this.respuestaError(res, error);
        }
    }

    respuestaError(res, error) {
        const response = new ResponseModel(null, 1, error.message || 'Error interno del servidor', this.statusError);
        return res.status(this.statusError).json(response);
    }

    respuestaNoEncontrado(res, mensaje = 'Recurso no encontrado') {
        const response = new ResponseModel(null, 1, mensaje, this.statusNotFound);
        return res.status(this.statusNotFound).json(response);
    }

    respuestaExito(res, data, mensaje = 'Operación exitosa') {
        const response = new ResponseModel(data, 0, mensaje, this.statusOk);
        return res.status(this.statusOk).json(response);
    }
}