import { BaseDao, prisma } from './BaseDao.js';

function obtenerFechaMexico() {
    const partes = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date());
    const valores = Object.fromEntries(partes.map(({ type, value }) => [type, value]));
    return `${valores.year}-${valores.month}-${valores.day}`;
}

export class ClienteMembresiaDao extends BaseDao {
    constructor() {
        super('clienteMembresia');
    }

    async asignarEnTransaccion(client, {
        clienteId,
        tipoMembresiaId,
        fechaInicio,
        renovacionAutomatica = false,
        empresaId,
        sucursalId,
    }) {
        const contexto = this.aplicarDatosContexto({}, empresaId, sucursalId);
        const clienteIdNumerico = Number(clienteId);
        const tipoIdNumerico = Number(tipoMembresiaId);
        const tipo = await client.tipoMembresia.findFirst({
            where: {
                id: tipoIdNumerico,
                deletedAt: null,
                ...(contexto.empresaId ? { empresaId: contexto.empresaId } : {}),
                ...(contexto.sucursalId ? { sucursalId: contexto.sucursalId } : {}),
            },
        });
        if (!tipo) throw new Error('El tipo de membresía especificado no existe');

        const buscarOCrearEstado = async (nombre, descripcion) => {
            const where = {
                nombre,
                ...(contexto.empresaId ? { empresaId: contexto.empresaId } : {}),
                ...(contexto.sucursalId ? { sucursalId: contexto.sucursalId } : {}),
            };
            let estado = await client.estadoMembresia.findFirst({ where });
            if (!estado) {
                estado = await client.estadoMembresia.create({
                    data: { ...where, descripcion },
                });
            }
            return estado;
        };

        const estadoVigente = await buscarOCrearEstado('Vigente', 'Membresía activa');
        const estadoVencida = await buscarOCrearEstado('Vencida', 'Membresía vencida');

        const fechaInicioTexto = typeof fechaInicio === 'string' && fechaInicio.trim()
            ? fechaInicio.split('T')[0]
            : obtenerFechaMexico();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaInicioTexto)) {
            throw new Error('La fecha de inicio de la membresía no es válida');
        }

        const [anio, mes, dia] = fechaInicioTexto.split('-').map(Number);
        const inicio = new Date(Date.UTC(anio, mes - 1, dia));
        const fin = new Date(inicio);
        fin.setUTCDate(fin.getUTCDate() + Number(tipo.duracionDias));
        if (!Number.isFinite(fin.getTime())) {
            throw new Error('La duración del tipo de membresía no es válida');
        }
        const estadoFinal = fin.toISOString().slice(0, 10) < obtenerFechaMexico()
            ? estadoVencida
            : estadoVigente;

        await client.clienteMembresia.updateMany({
            where: {
                clienteId: clienteIdNumerico,
                estadoMembresiaId: estadoVigente.id,
                deletedAt: null,
                ...(contexto.empresaId ? { empresaId: contexto.empresaId } : {}),
                ...(contexto.sucursalId ? { sucursalId: contexto.sucursalId } : {}),
            },
            data: { estadoMembresiaId: estadoVencida.id },
        });

        return client.clienteMembresia.create({
            data: {
                clienteId: clienteIdNumerico,
                tipoMembresiaId: tipoIdNumerico,
                estadoMembresiaId: estadoFinal.id,
                fechaInicio: inicio,
                fechaFin: fin,
                renovacionAutomatica: Boolean(renovacionAutomatica),
                ...contexto,
            },
            include: {
                tipoMembresia: true,
                estadoMembresia: true,
            },
        });
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
