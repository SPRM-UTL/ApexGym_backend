import { clienteMembresiaDao } from '../dao/ClienteMembresiaDao.js';
import { tipoMembresiaDao } from '../dao/TipoMembresiaDao.js';
import { estadoMembresiaDao } from '../dao/EstadoMembresiaDao.js';
import { clienteDao } from '../dao/ClienteDao.js';
import { BaseController } from './BaseController.js';
import { prisma } from '../dao/BaseDao.js';

export class ClienteMembresiaController extends BaseController {
    constructor() {
        super(clienteMembresiaDao);
    }

    asignar = async (req, res) => {
        try {
            const { clienteId, tipoMembresiaId, fechaInicio, renovacionAutomatica } = req.body;

            this.validar({ clienteId, tipoMembresiaId });

            const cliente = await clienteDao.getById(Number(clienteId));
            if (!cliente) {
                throw new Error('El cliente especificado no existe');
            }

            const tipo = await tipoMembresiaDao.getById(Number(tipoMembresiaId));
            if (!tipo) {
                throw new Error('El tipo de membresía especificado no existe');
            }

            const fechaInicioStr = typeof fechaInicio === 'string' && fechaInicio.trim() !== ''
                ? fechaInicio.split('T')[0]
                : new Date().toISOString().split('T')[0];

            const [y, m, d] = fechaInicioStr.split('-').map(Number);
            const inicioDate = new Date(Date.UTC(y, m - 1, d));
            const finDate = new Date(inicioDate);
            finDate.setUTCDate(finDate.getUTCDate() + Number(tipo.duracionDias));

            let estadoVigente = await prisma.estadoMembresia.findFirst({ where: { nombre: 'Vigente' } });
            if (!estadoVigente) {
                estadoVigente = await prisma.estadoMembresia.create({
                    data: { nombre: 'Vigente', descripcion: 'Membresía activa' }
                });
            }

            let estadoVencida = await prisma.estadoMembresia.findFirst({ where: { nombre: 'Vencida' } });
            if (!estadoVencida) {
                estadoVencida = await prisma.estadoMembresia.create({
                    data: { nombre: 'Vencida', descripcion: 'Membresía vencida' }
                });
            }

            await prisma.clienteMembresia.updateMany({
                where: {
                    clienteId: Number(clienteId),
                    estadoMembresiaId: estadoVigente.id,
                    deletedAt: null
                },
                data: {
                    estadoMembresiaId: estadoVencida.id
                }
            });

            const hoyUTC = new Date();
            hoyUTC.setUTCHours(0, 0, 0, 0);
            const estadoFinalId = finDate < hoyUTC ? estadoVencida.id : estadoVigente.id;

            const nuevaMembresia = await this.dao.create({
                clienteId: Number(clienteId),
                tipoMembresiaId: Number(tipoMembresiaId),
                estadoMembresiaId: estadoFinalId,
                fechaInicio: inicioDate,
                fechaFin: finDate,
                renovacionAutomatica: Boolean(renovacionAutomatica)
            });

            const registroCompleto = await this.dao.getById(nuevaMembresia.id);
            return this.respuestaExito(res, registroCompleto, 'Membresía asignada exitosamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    crear = this.asignar;

    obtenerHistorialPorCliente = async (req, res) => {
        try {
            const clienteId = Number(req.params.clienteId);
            if (isNaN(clienteId)) {
                throw new Error('ID de cliente no válido');
            }

            const historial = await this.dao.getHistorialPorCliente(clienteId);
            return this.respuestaExito(res, historial, 'Historial de membresías obtenido exitosamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    obtenerActivaPorCliente = async (req, res) => {
        try {
            const clienteId = Number(req.params.clienteId);
            if (isNaN(clienteId)) {
                throw new Error('ID de cliente no válido');
            }

            const activa = await this.dao.getActivaPorCliente(clienteId);
            return this.respuestaExito(res, activa, 'Membresía activa obtenida exitosamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    renovar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) {
                throw new Error('ID de membresía no válido');
            }

            const membresiaAnterior = await this.dao.getById(id);
            if (!membresiaAnterior) {
                return this.respuestaNoEncontrado(res, 'La membresía no existe');
            }

            const tipoId = req.body.tipoMembresiaId ? Number(req.body.tipoMembresiaId) : membresiaAnterior.tipoMembresiaId;
            const tipo = await tipoMembresiaDao.getById(tipoId);
            if (!tipo) {
                throw new Error('Tipo de membresía no válido');
            }

            let estadoVigente = await prisma.estadoMembresia.findFirst({ where: { nombre: 'Vigente' } });
            let estadoVencida = await prisma.estadoMembresia.findFirst({ where: { nombre: 'Vencida' } });

            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);

            let nuevaInicio;
            if (membresiaAnterior.estadoMembresia?.nombre === 'Vigente' && new Date(membresiaAnterior.fechaFin) >= hoy) {
                nuevaInicio = new Date(membresiaAnterior.fechaFin);
            } else {
                nuevaInicio = new Date(hoy);
            }

            const nuevaFin = new Date(nuevaInicio);
            nuevaFin.setDate(nuevaFin.getDate() + Number(tipo.duracionDias));

            if (estadoVencida) {
                await this.dao.update(id, { estadoMembresiaId: estadoVencida.id });
            }

            const nuevaMembresia = await this.dao.create({
                clienteId: membresiaAnterior.clienteId,
                tipoMembresiaId: tipo.id,
                estadoMembresiaId: estadoVigente.id,
                fechaInicio: nuevaInicio,
                fechaFin: nuevaFin,
                renovacionAutomatica: req.body.renovacionAutomatica !== undefined
                    ? Boolean(req.body.renovacionAutomatica)
                    : Boolean(membresiaAnterior.renovacionAutomatica)
            });

            const registroCompleto = await this.dao.getById(nuevaMembresia.id);
            return this.respuestaExito(res, registroCompleto, 'Membresía renovada exitosamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    cancelar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) {
                throw new Error('ID no válido');
            }

            let estadoCancelada = await prisma.estadoMembresia.findFirst({ where: { nombre: 'Cancelada' } });
            if (!estadoCancelada) {
                estadoCancelada = await prisma.estadoMembresia.create({
                    data: { nombre: 'Cancelada', descripcion: 'Membresía cancelada' }
                });
            }

            const registro = await this.dao.update(id, {
                estadoMembresiaId: estadoCancelada.id,
                renovacionAutomatica: false
            });

            const registroCompleto = await this.dao.getById(registro.id);
            return this.respuestaExito(res, registroCompleto, 'Membresía cancelada correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    eliminar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) {
                throw new Error('ID no válido');
            }
            const registro = await this.dao.delete(id);
            return this.respuestaExito(res, registro, 'Membresía eliminada correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    validar({ clienteId, tipoMembresiaId }) {
        if (!clienteId) throw new Error('El cliente es requerido');
        if (!tipoMembresiaId) throw new Error('El tipo de membresía es requerido');
    }
}

export const clienteMembresiaController = new ClienteMembresiaController();
