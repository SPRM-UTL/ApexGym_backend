import { clienteMembresiaDao } from '../dao/ClienteMembresiaDao.js';
import { tipoMembresiaDao } from '../dao/TipoMembresiaDao.js';
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

            const nuevaMembresia = await prisma.$transaction((tx) => (
                this.dao.asignarEnTransaccion(tx, {
                    clienteId,
                    tipoMembresiaId,
                    fechaInicio,
                    renovacionAutomatica,
                    empresaId: this.obtenerEmpresaId(req),
                    sucursalId: this.obtenerSucursalId(req),
                })
            ));
            return this.respuestaExito(res, nuevaMembresia, 'Membresía asignada exitosamente');
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

            if (!Number.isInteger(id) || id <= 0) {
                throw new Error('ID de membresía no válido');
            }

            const membresiaAnterior = await this.dao.getById(id);
            if (!membresiaAnterior) {
                return this.respuestaNoEncontrado(res, 'La membresía no existe');
            }

            const tipoMembresiaId = req.body?.tipoMembresiaId ? Number(req.body.tipoMembresiaId) : membresiaAnterior.tipoMembresiaId;
            const renovacionAutomatica = req.body?.renovacionAutomatica !== undefined ? req.body.renovacionAutomatica : membresiaAnterior.renovacionAutomatica;

            const nuevaMembresia = await prisma.$transaction((tx) =>
            this.dao.asignarEnTransaccion(tx, {
                clienteId: membresiaAnterior.clienteId,
                tipoMembresiaId,
                renovacionAutomatica,
                empresaId: this.obtenerEmpresaId(req),
                sucursalId: this.obtenerSucursalId(req),
            })
        );

            return this.respuestaExito(res, nuevaMembresia, 'Membresía renovada exitosamente');
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

    obtenerMiMembresia = async (req, res) => {
        try {
            const usuarioId = req.usuario?.id;
            if (!usuarioId) {
                throw new Error('Usuario no autenticado');
            }

            const cliente = await clienteDao.getByUser(Number(usuarioId));
            if (!cliente) {
                return this.respuestaExito(
                    res,
                    { cliente: null, membresiaActiva: null, historial: [] },
                    'Sin perfil de cliente asociado'
                );
            }

            const membresiaActiva = await this.dao.getActivaPorCliente(cliente.id);
            const historial = await this.dao.getHistorialPorCliente(cliente.id);

            return this.respuestaExito(
                res,
                {
                    cliente,
                    membresiaActiva: membresiaActiva || null,
                    historial: historial || []
                },
                'Información de membresía cargada con éxito'
            );
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };
}

export const clienteMembresiaController = new ClienteMembresiaController();
