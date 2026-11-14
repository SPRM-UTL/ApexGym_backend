import { ResponseModel } from '../modelos/ResponseModel.js';

export class BaseController {
    constructor(dao) {
        this.statusOk = 200;
        this.statusError = 500;
        this.statusNotFound = 404;

        this.dao = dao;
    }

    /**
     * Obtiene el empresaId del usuario autenticado con fallback seguro a 1
     * para garantizar retrocompatibilidad total cuando no se envía en body/query.
     */
    obtenerEmpresaId(req) {
        const id = Number(req?.user?.empresaId ?? req?.usuario?.empresaId ?? 1);
        return Number.isInteger(id) && id > 0 ? id : 1;
    }

    /**
     * Obtiene el sucursalId del header x-sucursal-id, query o usuario autenticado
     * con fallback seguro a 1 para retrocompatibilidad total.
     */
    obtenerSucursalId(req) {
        const raw =
            req.headers['x-sucursal-id'] ??
            req.query?.sucursalId ??
            req?.user?.sucursalId ??
            req?.usuario?.sucursalId;
        if (raw === 'todas') return 'todas';
        const parsed = Number(raw);
        return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
    }

    inyectarEmpresaEnDatos(req, data = {}) {
        return this.inyectarContextoEnDatos(req, data);
    }

    inyectarContextoEnDatos(req, data = {}) {
        if (!data || typeof data !== 'object') return data;
        const empresaId = this.obtenerEmpresaId(req);
        const sucursalId = this.obtenerSucursalId(req);
        const resultado = { ...data };
        if (this.dao?.useEmpresa && resultado.empresaId === undefined) {
            resultado.empresaId = empresaId;
        }
        if (this.dao?.useSucursal && resultado.sucursalId === undefined && sucursalId !== 'todas') {
            resultado.sucursalId = sucursalId;
        }
        return resultado;
    }

    obtenerTodos = async (req, res) => {
        try {
            const empresaId = this.obtenerEmpresaId(req);
            const sucursalId = this.obtenerSucursalId(req);
            const filtroContexto = {};
            if (this.dao?.useEmpresa) filtroContexto.empresaId = empresaId;
            if (this.dao?.useSucursal && sucursalId !== 'todas') filtroContexto.sucursalId = sucursalId;

            const registros = await this.dao.getAll(filtroContexto, { id: 'desc' }, empresaId, sucursalId);
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
            const empresaId = this.obtenerEmpresaId(req);
            const sucursalId = this.obtenerSucursalId(req);
            const registro = await this.dao.getById(id, empresaId, sucursalId);
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
