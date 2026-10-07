import { aperturaCajaDao } from '../dao/AperturaCajaDao.js';
import { BaseController } from './BaseController.js';
import { prisma } from '../dao/BaseDao.js';

export class AperturaCajaController extends BaseController {
    constructor() {
        super(aperturaCajaDao);
    }

    crear = async (req, res) => {
        try {
            const { cajaId, empleadoId, montoInicial, fechaApertura, observaciones, desgloseInicio } = req.body;

            this.validar({ cajaId, empleadoId, montoInicial, fechaApertura, observaciones });

            // Verificar que la caja no tenga ya una apertura ABIERTA
            const aperturaAbierta = await prisma.aperturaCaja.findFirst({
                where: {
                    cajaId: Number(cajaId),
                    estado: 'ABIERTA',
                    deletedAt: null,
                },
            });
            if (aperturaAbierta) {
                throw new Error('La caja seleccionada ya tiene una sesión abierta activa');
            }

            const registro = await this.dao.create({
                cajaId: Number(cajaId),
                empleadoId: Number(empleadoId),
                montoInicial: Number(montoInicial),
                fechaApertura: new Date(fechaApertura),
                estado: 'ABIERTA',
                desgloseInicio: typeof desgloseInicio === 'object' ? JSON.stringify(desgloseInicio) : (desgloseInicio || null),
                observaciones: observaciones ? observaciones.trim() : null,
            });

            return this.respuestaExito(res, registro, 'Apertura de caja creada correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    actualizar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) throw new Error('ID no válido');

            const { cajaId, empleadoId, montoInicial, fechaApertura, observaciones } = req.body;

            // No se permite cambiar el estado directamente mediante este endpoint
            this.validar({ cajaId, empleadoId, montoInicial, fechaApertura, observaciones });

            const registro = await this.dao.update(id, {
                cajaId: Number(cajaId),
                empleadoId: Number(empleadoId),
                montoInicial: Number(montoInicial),
                fechaApertura: new Date(fechaApertura),
                observaciones: observaciones !== undefined ? (observaciones ? observaciones.trim() : null) : undefined,
            });

            return this.respuestaExito(res, registro, 'Apertura de caja actualizada correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    eliminar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) throw new Error('ID no válido');
            const registro = await this.dao.delete(id);
            return this.respuestaExito(res, registro, 'Apertura de caja eliminada correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    /**
     * POST /:id/cerrar
     * Cierra una apertura solo si tiene al menos un corte de caja registrado.
     */
    cerrar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) throw new Error('ID no válido');

            const apertura = await this.dao.getById(id);
            if (!apertura) return this.respuestaNoEncontrado(res, 'Apertura de caja no encontrada');
            if (apertura.estado === 'CERRADA') throw new Error('La apertura de caja ya está cerrada');

            // Verificar que exista al menos un corte registrado para esta apertura
            const corte = await prisma.corteCaja.findFirst({
                where: { aperturaCajaId: id, deletedAt: null },
            });
            if (!corte) throw new Error('No se puede cerrar la apertura sin un corte de caja registrado');

            const registro = await this.dao.update(id, { estado: 'CERRADA' });
            return this.respuestaExito(res, registro, 'Apertura de caja cerrada correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    validar({ cajaId, empleadoId, montoInicial, fechaApertura, observaciones }) {
        if (!cajaId || isNaN(Number(cajaId))) throw new Error('La caja es requerida');
        if (!empleadoId || isNaN(Number(empleadoId))) throw new Error('El empleado es requerido');
        if (montoInicial === undefined || montoInicial === null || isNaN(Number(montoInicial)))
            throw new Error('El monto inicial es requerido');
        if (Number(montoInicial) < 0) throw new Error('El monto inicial debe ser mayor o igual a 0');
        if (Number(montoInicial) > 9999999.99) throw new Error('El monto inicial no puede exceder $9,999,999.99');
        if (!fechaApertura || isNaN(Date.parse(fechaApertura)))
            throw new Error('La fecha de apertura es requerida y debe ser válida');
        if (observaciones && observaciones.trim().length > 500)
            throw new Error('Las observaciones no pueden exceder 500 caracteres');
    }
}

export const aperturaCajaController = new AperturaCajaController();
