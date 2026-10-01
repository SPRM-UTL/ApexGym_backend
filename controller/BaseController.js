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
            const registros = await this.dao.getAll();
            if (!registros) {
                throw new Error("No se encontraron registros");
            }

            return this.respuestaExito(res, registros, "Registros obtenidos exitosamente");

        } catch (error) {
            return this.respuestaError(res, error);
        }
    }

    obtenerPorId = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) {
                throw new Error("ID no válido");
            }
            const registro = await this.dao.getById(id);
            if (!registro) {
                return this.respuestaNoEncontrado(res, "Registro no encontrado");
            }
            return this.respuestaExito(res, registro, "Registro obtenido exitosamente");
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