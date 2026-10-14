import { BaseDao, prisma } from './BaseDao.js';

export class ClienteMembresiaDao extends BaseDao {
    constructor() {
        super('clienteMembresia');
    }

    async sincronizarEstadosVencidos() {
        try {
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);

            const vencidas = await this.model.findMany({
                where: {
                    estadoMembresia: { nombre: 'Vigente' },
                    fechaFin: { lt: hoy },
                    deletedAt: null
                },
                include: {
                    tipoMembresia: true
                }
            });

            const estadoVencida = await prisma.estadoMembresia.findFirst({ where: { nombre: 'Vencida' } });
            const estadoVigente = await prisma.estadoMembresia.findFirst({ where: { nombre: 'Vigente' } });

            for (const item of vencidas) {
                if (item.renovacionAutomatica && item.tipoMembresia && estadoVigente) {
                    if (estadoVencida) {
                        await this.model.update({
                            where: { id: item.id },
                            data: { estadoMembresiaId: estadoVencida.id }
                        });
                    }

                    const nuevaInicio = new Date(item.fechaFin);
                    const nuevaFin = new Date(nuevaInicio);
                    nuevaFin.setDate(nuevaFin.getDate() + Number(item.tipoMembresia.duracionDias));

                    await this.model.create({
                        data: {
                            clienteId: item.clienteId,
                            tipoMembresiaId: item.tipoMembresiaId,
                            estadoMembresiaId: estadoVigente.id,
                            fechaInicio: nuevaInicio,
                            fechaFin: nuevaFin,
                            renovacionAutomatica: true
                        }
                    });
                } else if (estadoVencida) {
                    await this.model.update({
                        where: { id: item.id },
                        data: { estadoMembresiaId: estadoVencida.id }
                    });
                }
            }
        } catch (error) {
            console.error('Error al sincronizar estados de membresías:', error);
        }
    }

    async getAll(additionalWhere = {}) {
        await this.sincronizarEstadosVencidos();

        return this.model.findMany({
            where: {
                deletedAt: null,
                ...additionalWhere
            },
            include: {
                cliente: true,
                tipoMembresia: true,
                estadoMembresia: true
            },
            orderBy: {
                fechaInicio: 'desc'
            },
            omit: this.omit
        });
    }

    async getById(id) {
        await this.sincronizarEstadosVencidos();

        return this.model.findUnique({
            where: {
                id: Number(id),
                deletedAt: null
            },
            include: {
                cliente: true,
                tipoMembresia: true,
                estadoMembresia: true
            },
            omit: this.omit
        });
    }

    async getHistorialPorCliente(clienteId) {
        await this.sincronizarEstadosVencidos();

        return this.model.findMany({
            where: {
                clienteId: Number(clienteId),
                deletedAt: null
            },
            include: {
                tipoMembresia: true,
                estadoMembresia: true
            },
            orderBy: {
                fechaInicio: 'desc'
            },
            omit: this.omit
        });
    }

    async getActivaPorCliente(clienteId) {
        await this.sincronizarEstadosVencidos();

        return this.model.findFirst({
            where: {
                clienteId: Number(clienteId),
                estadoMembresia: { nombre: 'Vigente' },
                deletedAt: null
            },
            include: {
                tipoMembresia: true,
                estadoMembresia: true
            },
            orderBy: {
                fechaFin: 'desc'
            },
            omit: this.omit
        });
    }
}

export const clienteMembresiaDao = new ClienteMembresiaDao();
