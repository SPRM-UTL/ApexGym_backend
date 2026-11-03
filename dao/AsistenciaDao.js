import { BaseDao, prisma } from './BaseDao.js';
import { clienteMembresiaDao } from './ClienteMembresiaDao.js';

export class AsistenciaDao extends BaseDao {
    constructor() {
        super('asistencia', {
            omit: {
                createdAt: true,
                updatedAt: true,
                deletedAt: true,
            }
        });
    }

    /**
     * Valida si un socio tiene acceso permitido según su membresía y registra la asistencia
     * @param {Object} params
     * @param {string|number} params.identificador - ID, correo, teléfono o código de socio
     * @param {string} [params.observaciones] - Notas opcionales del recepcionista
     */
    async validarYRegistrarAcceso({ identificador, observaciones = null }) {
        if (!identificador) {
            throw new Error('Debe proporcionar un identificador de socio (ID, código, correo o teléfono)');
        }

        const idNum = Number(identificador);
        const whereCliente = !isNaN(idNum) && idNum > 0
            ? { id: idNum }
            : {
                OR: [
                    { correo: String(identificador).trim() },
                    { telefono: String(identificador).trim() }
                ]
            };

        // 1. Buscar al cliente
        const cliente = await prisma.cliente.findFirst({
            where: {
                ...whereCliente,
                deletedAt: null
            },
            include: {
                estadoCliente: true,
                usuario: {
                    select: {
                        id: true,
                        nombreUsuario: true,
                        correo: true,
                        avatarUrl: true
                    }
                }
            }
        });

        if (!cliente) {
            return {
                acceso: false,
                codigo: 'CLIENTE_NO_ENCONTRADO',
                mensaje: 'No se encontró ningún socio registrado con el identificador proporcionado.',
                cliente: null,
                membresia: null
            };
        }

        // 2. Verificar estado del socio
        const estadoClienteNombre = cliente.estadoCliente?.nombre?.toUpperCase() || '';
        if (estadoClienteNombre === 'INACTIVO' || estadoClienteNombre === 'SUSPENDIDO') {
            return {
                acceso: false,
                codigo: 'CLIENTE_INACTIVO',
                mensaje: `Acceso denegado: El socio se encuentra en estado "${cliente.estadoCliente?.nombre}".`,
                cliente,
                membresia: null
            };
        }

        // 3. Sincronizar membresías vencidas
        await clienteMembresiaDao.sincronizarEstadosVencidos();

        const hoy = new Date();
        const hoyInicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0, 0);

        // 4. Buscar membresía activa o la más reciente
        const membresias = await prisma.clienteMembresia.findMany({
            where: {
                clienteId: cliente.id,
                deletedAt: null
            },
            include: {
                tipoMembresia: true,
                estadoMembresia: true
            },
            orderBy: {
                fechaFin: 'desc'
            }
        });

        if (!membresias || membresias.length === 0) {
            return {
                acceso: false,
                codigo: 'SIN_MEMBRESIA',
                mensaje: 'Acceso denegado: El socio no cuenta con ninguna membresía asignada.',
                cliente,
                membresia: null
            };
        }

        const membresiaActual = membresias.find(m => {
            const estado = m.estadoMembresia?.nombre?.toLowerCase() || '';
            const fin = new Date(m.fechaFin);
            fin.setHours(23, 59, 59, 999);
            return (estado === 'vigente' || estado === 'activa') && fin >= hoyInicio;
        }) || membresias[0];

        const fechaFin = new Date(membresiaActual.fechaFin);
        fechaFin.setHours(23, 59, 59, 999);
        const diasRestantes = Math.ceil((fechaFin.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
        const esVigente = (membresiaActual.estadoMembresia?.nombre?.toLowerCase() === 'vigente' ||
                           membresiaActual.estadoMembresia?.nombre?.toLowerCase() === 'activa') && diasRestantes >= 0;

        if (!esVigente) {
            return {
                acceso: false,
                codigo: 'MEMBRESIA_VENCIDA',
                mensaje: `Acceso denegado: La membresía "${membresiaActual.tipoMembresia?.nombre}" venció el ${fechaFin.toLocaleDateString('es-MX')}.`,
                diasVencida: Math.abs(diasRestantes),
                cliente,
                membresia: membresiaActual
            };
        }

        // 5. Registrar asistencia efectiva
        const asistencia = await prisma.asistencia.create({
            data: {
                clienteId: cliente.id,
                clienteMembresiaId: membresiaActual.id,
                fechaHora: new Date(),
                observaciones: observaciones ? String(observaciones).trim() : null
            },
            include: {
                cliente: true,
                clienteMembresia: {
                    include: {
                        tipoMembresia: true
                    }
                }
            }
        });

        const porVencer = diasRestantes <= 3;
        return {
            acceso: true,
            codigo: porVencer ? 'ACCESO_PERMITIDO_POR_VENCER' : 'ACCESO_PERMITIDO',
            mensaje: porVencer
                ? `Acceso permitido. ¡Aviso! La membresía vence en ${diasRestantes} día(s).`
                : 'Acceso permitido.',
            diasRestantes,
            cliente,
            membresia: membresiaActual,
            asistencia
        };
    }

    /**
     * Registra una visita temporal (pase por día / visita externa)
     */
    async registrarVisita({ nombreVisitante, tipoVisitaId, costo, observaciones = null }) {
        if (!nombreVisitante || !String(nombreVisitante).trim()) {
            throw new Error('El nombre del visitante es obligatorio');
        }
        if (!tipoVisitaId || isNaN(Number(tipoVisitaId))) {
            throw new Error('Debe especificar un tipo de visita válido');
        }

        const tipoVisita = await prisma.tipoVisita.findUnique({
            where: { id: Number(tipoVisitaId) }
        });

        if (!tipoVisita || tipoVisita.deletedAt !== null) {
            throw new Error('El tipo de visita especificado no existe o no está activo');
        }

        const costoFinal = costo !== undefined && costo !== null && !isNaN(parseFloat(costo))
            ? parseFloat(costo)
            : parseFloat(tipoVisita.precio || 0);

        return prisma.visita.create({
            data: {
                nombreVisitante: String(nombreVisitante).trim(),
                tipoVisitaId: Number(tipoVisitaId),
                costo: costoFinal,
                fechaHora: new Date(),
                observaciones: observaciones ? String(observaciones).trim() : null
            },
            include: {
                tipoVisita: true
            }
        });
    }

    /**
     * Obtiene el aforo actual (asistencias y visitas del día en curso)
     */
    async getAforoActual() {
        const hoyInicio = new Date();
        hoyInicio.setHours(0, 0, 0, 0);

        const [totalAsistenciasHoy, totalVisitasHoy, ultimosAccesos] = await Promise.all([
            prisma.asistencia.count({
                where: {
                    fechaHora: { gte: hoyInicio },
                    deletedAt: null
                }
            }),
            prisma.visita.count({
                where: {
                    fechaHora: { gte: hoyInicio },
                    deletedAt: null
                }
            }),
            prisma.asistencia.findMany({
                where: {
                    fechaHora: { gte: hoyInicio },
                    deletedAt: null
                },
                take: 10,
                orderBy: { fechaHora: 'desc' },
                include: {
                    cliente: {
                        select: {
                            id: true,
                            nombre: true,
                            apellidoPaterno: true,
                            apellidoMaterno: true
                        }
                    },
                    clienteMembresia: {
                        include: { tipoMembresia: true }
                    }
                }
            })
        ]);

        return {
            totalAsistenciasHoy,
            totalVisitasHoy,
            aforoTotalHoy: totalAsistenciasHoy + totalVisitasHoy,
            ultimosAccesos
        };
    }

    /**
     * Consulta el historial paginado de asistencias con filtros
     */
    async getHistorialAsistencias({ fechaInicio, fechaFin, clienteId, take = 50, skip = 0 }) {
        const where = { deletedAt: null };

        if (clienteId && !isNaN(Number(clienteId))) {
            where.clienteId = Number(clienteId);
        }

        if (fechaInicio || fechaFin) {
            where.fechaHora = {};
            if (fechaInicio) where.fechaHora.gte = new Date(fechaInicio);
            if (fechaFin) {
                const fin = new Date(fechaFin);
                fin.setHours(23, 59, 59, 999);
                where.fechaHora.lte = fin;
            }
        }

        const [total, registros] = await Promise.all([
            prisma.asistencia.count({ where }),
            prisma.asistencia.findMany({
                where,
                take: Number(take),
                skip: Number(skip),
                orderBy: { fechaHora: 'desc' },
                include: {
                    cliente: true,
                    clienteMembresia: {
                        include: {
                            tipoMembresia: true,
                            estadoMembresia: true
                        }
                    }
                }
            })
        ]);

        return { total, registros };
    }

    /**
     * Consulta el historial paginado de visitas
     */
    async getHistorialVisitas({ fechaInicio, fechaFin, tipoVisitaId, take = 50, skip = 0 }) {
        const where = { deletedAt: null };

        if (tipoVisitaId && !isNaN(Number(tipoVisitaId))) {
            where.tipoVisitaId = Number(tipoVisitaId);
        }

        if (fechaInicio || fechaFin) {
            where.fechaHora = {};
            if (fechaInicio) where.fechaHora.gte = new Date(fechaInicio);
            if (fechaFin) {
                const fin = new Date(fechaFin);
                fin.setHours(23, 59, 59, 999);
                where.fechaHora.lte = fin;
            }
        }

        const [total, registros] = await Promise.all([
            prisma.visita.count({ where }),
            prisma.visita.findMany({
                where,
                take: Number(take),
                skip: Number(skip),
                orderBy: { fechaHora: 'desc' },
                include: {
                    tipoVisita: true
                }
            })
        ]);

        return { total, registros };
    }
}

export const asistenciaDao = new AsistenciaDao();
