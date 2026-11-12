import {
    crearDevolucion,
    obtenerDisponibilidadDevolucion,
    previsualizarDevolucion,
} from '../dao/DevolucionDao.js';
import { ResponseModel } from '../modelos/ResponseModel.js';

export class DevolucionController {
    obtenerDisponibilidad = async (req, res) => {
        try {
            const ventaId = Number(req.params.id);
            if (!Number.isSafeInteger(ventaId) || ventaId <= 0) {
                return this.respuestaError(res, 'ID de venta no válido', 400);
            }

            const disponibilidad = await obtenerDisponibilidadDevolucion(ventaId);
            return res.status(200).json(new ResponseModel(
                disponibilidad,
                0,
                'Disponibilidad de devolución obtenida correctamente',
                200
            ));
        } catch (error) {
            const status = Number.isInteger(error.status) ? error.status : 500;
            return this.respuestaError(res, error.message, status, error.code);
        }
    };

    previsualizar = async (req, res) => {
        try {
            const ventaId = Number(req.params.id);
            if (!Number.isSafeInteger(ventaId) || ventaId <= 0) {
                return this.respuestaError(res, 'ID de venta no válido', 400);
            }

            const { detalles } = req.body ?? {};
            const previsualizacion = await previsualizarDevolucion({
                ventaId,
                detallesSolicitados: detalles,
            });

            return res.status(200).json(new ResponseModel(
                previsualizacion,
                0,
                'Previsualización de devolución calculada correctamente',
                200
            ));
        } catch (error) {
            const status = Number.isInteger(error.status) ? error.status : 500;
            return this.respuestaError(res, error.message, status, error.code);
        }
    };

    crear = async (req, res) => {
        try {
            const ventaId = Number(req.params.id);
            if (!Number.isSafeInteger(ventaId) || ventaId <= 0) {
                return this.respuestaError(res, 'ID de venta no válido', 400);
            }

            const {
                aperturaCajaId,
                motivo,
                detalles,
                montoPrevisualizado,
                cantidadesDevueltasPrevisualizadas,
            } = req.body ?? {};
            const devolucion = await crearDevolucion({
                ventaId,
                aperturaCajaId,
                motivo,
                detallesSolicitados: detalles,
                montoPrevisualizado,
                cantidadesDevueltasPrevisualizadas,
            });

            return res.status(201).json(new ResponseModel(
                devolucion,
                0,
                'Devolución registrada correctamente',
                201
            ));
        } catch (error) {
            const status = Number.isInteger(error.status) ? error.status : 500;
            return this.respuestaError(
                res,
                error.message || 'No se pudo registrar la devolución',
                status,
                error.code
            );
        }
    };

    respuestaError(res, mensaje, status, code) {
        return res.status(status).json(new ResponseModel(
            code ? { code } : null,
            1,
            mensaje,
            status
        ));
    }
}
