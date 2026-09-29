import { movimientoCajaDao } from '../dao/MovimientoCajaDao.js';
import { BaseController } from './BaseController.js';
import { prisma } from '../dao/BaseDao.js';

const TIPOS_VALIDOS = ['ENTRADA', 'SALIDA'];

export class MovimientoCajaController extends BaseController {
    constructor() {
        super(movimientoCajaDao);
    }

    crear = async (req, res) => {
        try {
            const { aperturaCajaId, empleadoId, tipo, monto, concepto, observaciones } = req.body;

            this.validar({ aperturaCajaId, empleadoId, tipo, monto, concepto });

            // Verificar que la apertura exista y esté ABIERTA
            const apertura = await prisma.aperturaCaja.findUnique({
                where: { id: Number(aperturaCajaId), deletedAt: null },
            });
            if (!apertura) throw new Error('La apertura de caja especificada no existe');
            if (apertura.estado !== 'ABIERTA')
                throw new Error('No se pueden registrar movimientos en una apertura cerrada');

            const registro = await this.dao.create({
                aperturaCajaId: Number(aperturaCajaId),
                empleadoId: Number(empleadoId),
                tipo: tipo.trim().toUpperCase(),
                monto: Number(monto),
                concepto: concepto.trim(),
                observaciones: observaciones ? observaciones.trim() : null,
            });

            return this.respuestaExito(res, registro, 'Movimiento de caja registrado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    eliminar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) throw new Error('ID no válido');
            const registro = await this.dao.delete(id);
            return this.respuestaExito(res, registro, 'Movimiento de caja eliminado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    obtenerPorApertura = async (req, res) => {
        try {
            const aperturaCajaId = Number(req.params.aperturaCajaId);
            if (isNaN(aperturaCajaId)) throw new Error('ID de apertura no válido');
            const registros = await this.dao.getAllByApertura(aperturaCajaId);
            return this.respuestaExito(res, registros, 'Movimientos obtenidos exitosamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    validar({ aperturaCajaId, empleadoId, tipo, monto, concepto }) {
        if (!aperturaCajaId || isNaN(Number(aperturaCajaId)))
            throw new Error('La apertura de caja es requerida');
        if (!empleadoId || isNaN(Number(empleadoId))) throw new Error('El empleado es requerido');
        if (!tipo?.trim()) throw new Error('El tipo de movimiento es requerido');
        if (!TIPOS_VALIDOS.includes(tipo.trim().toUpperCase()))
            throw new Error('El tipo de movimiento debe ser ENTRADA o SALIDA');
        if (monto === undefined || monto === null || isNaN(Number(monto)))
            throw new Error('El monto es requerido');
        if (Number(monto) <= 0) throw new Error('El monto debe ser mayor a 0');
        if (!concepto?.trim()) throw new Error('El concepto del movimiento es requerido');
    }
}

export const movimientoCajaController = new MovimientoCajaController();
