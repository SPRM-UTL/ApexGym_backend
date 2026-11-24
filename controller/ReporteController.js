import { reporteDao } from '../dao/ReporteDao.js';
import { ResponseModel } from '../modelos/ResponseModel.js';
import { BaseController } from './BaseController.js';

export class ReporteController extends BaseController {
    constructor(dao = reporteDao) {
        super(dao);
    }

    extraerFiltros(req) {
        return {
            fechaInicio: req.query?.fechaInicio,
            fechaFin: req.query?.fechaFin,
            almacenId: req.query?.almacenId,
            empresaId: this.obtenerEmpresaId(req),
            sucursalId: this.obtenerSucursalId(req),
        };
    }

    manejarError(res, error) {
        if ([400, 403, 404].includes(error?.status)) {
            return res.status(error.status).json(
                new ResponseModel(null, 1, error.message, error.status)
            );
        }
        return this.respuestaError(res, error);
    }

    obtenerResumen = async (req, res) => {
        try {
            const datos = await this.dao.obtenerResumenCompleto(this.extraerFiltros(req));
            return this.respuestaExito(res, datos, 'Resumen de reportes obtenido correctamente');
        } catch (error) {
            return this.manejarError(res, error);
        }
    };

    obtenerVentas = async (req, res) => {
        try {
            const datos = await this.dao.obtenerReporteVentas(this.extraerFiltros(req));
            return this.respuestaExito(res, datos, 'Reporte de ventas obtenido correctamente');
        } catch (error) {
            return this.manejarError(res, error);
        }
    };

    obtenerRendimiento = async (req, res) => {
        try {
            const datos = await this.dao.obtenerReporteRendimiento(this.extraerFiltros(req));
            return this.respuestaExito(res, datos, 'Reporte de rendimiento obtenido correctamente');
        } catch (error) {
            return this.manejarError(res, error);
        }
    };

    obtenerTopProductos = async (req, res) => {
        try {
            const datos = await this.dao.obtenerTopProductos(this.extraerFiltros(req));
            return this.respuestaExito(res, datos, 'Top de productos vendidos obtenido correctamente');
        } catch (error) {
            return this.manejarError(res, error);
        }
    };
}

export const reporteController = new ReporteController();
