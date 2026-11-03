import { BaseDao, prisma } from './BaseDao.js';
import { clienteMembresiaDao } from './ClienteMembresiaDao.js';

export class AppMembresiaDao extends BaseDao {
    constructor() {
        super('clienteMembresia');
    }

    /**
     * Obtiene el cliente asociado a un usuario autenticado o ID directo.
     */
    async obtenerClientePorUsuario(usuarioId, clienteId = null) {
        if (clienteId) {
            const cliente = await prisma.cliente.findUnique({
                where: { id: Number(clienteId), deletedAt: null }
            });
            if (cliente) return cliente;
        }

        if (usuarioId) {
            return prisma.cliente.findFirst({
                where: { usuarioId: Number(usuarioId), deletedAt: null }
            });
        }

        return null;
    }

    /**
     * Beneficios por defecto en caso de que el tipo no tenga personalizados aún.
     */
    obtenerBeneficiosPredeterminados(nombrePlan = '') {
        const base = [
            { id: 'b1', titulo: 'Acceso Total a Instalaciones', descripcion: 'Área de pesas, cardio y zona funcional', icono: 'fitness_center' },
            { id: 'b2', titulo: 'Vestidores y Regaderas', descripcion: 'Lockers de uso diario y regaderas con agua caliente', icono: 'shower' },
            { id: 'b3', titulo: 'Pase Virtual QR', descripcion: 'Acceso ágil por torniquete desde la app móvil', icono: 'qr_code_scanner' }
        ];

        if (nombrePlan.toLowerCase().includes('vip') || nombrePlan.toLowerCase().includes('anual')) {
            base.push({ id: 'b4', titulo: 'Asesoría Nutricional y Rutina', descripcion: 'Evaluación inicial y rutina adaptada a objetivos', icono: 'assignment_turned_in' });
            base.push({ id: 'b5', titulo: 'Invitado Mensual', descripcion: 'Pase de cortesía para un acompañante cada mes', icono: 'group_add' });
        }

        return base;
    }

    /**
     * Consulta la membresía activa del cliente para la aplicación móvil.
     */
    async getMiMembresia(usuarioId, clienteIdParam = null) {
        await clienteMembresiaDao.sincronizarEstadosVencidos();

        const cliente = await this.obtenerClientePorUsuario(usuarioId, clienteIdParam);
        if (!cliente) {
            return {
                encontrado: false,
                mensaje: 'Perfil de cliente no asociado a la cuenta'
            };
        }

        // Buscar primero activa/vigente
        let membresia = await prisma.clienteMembresia.findFirst({
            where: {
                clienteId: cliente.id,
                estadoMembresia: { nombre: 'Vigente' },
                deletedAt: null
            },
            include: {
                tipoMembresia: {
                    include: {
                        beneficios: {
                            where: { deletedAt: null }
                        }
                    }
                },
                estadoMembresia: true
            },
            orderBy: { fechaFin: 'desc' }
        });

        const esActiva = Boolean(membresia);

        // Si no tiene activa, obtener la más reciente (vencida o cancelada) para mostrar contexto
        if (!membresia) {
            membresia = await prisma.clienteMembresia.findFirst({
                where: {
                    clienteId: cliente.id,
                    deletedAt: null
                },
                include: {
                    tipoMembresia: {
                        include: {
                            beneficios: {
                                where: { deletedAt: null }
                            }
                        }
                    },
                    estadoMembresia: true
                },
                orderBy: { fechaFin: 'desc' }
            });
        }

        const nombreCompleto = `${cliente.nombre} ${cliente.apellidoPaterno} ${cliente.apellidoMaterno || ''}`.trim();
        const codigoAcceso = `APEX-CLI-${cliente.id}`;

        if (!membresia) {
            return {
                encontrado: true,
                cliente: {
                    id: cliente.id,
                    nombreCompleto,
                    codigoAcceso
                },
                tieneMembresia: false,
                membresia: null
            };
        }

        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const fechaFin = new Date(membresia.fechaFin);
        fechaFin.setHours(0, 0, 0, 0);

        const diffTime = fechaFin.getTime() - hoy.getTime();
        const diasRestantes = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

        let listaBeneficios = (membresia.tipoMembresia?.beneficios || []).map(b => ({
            id: b.id,
            titulo: b.titulo,
            descripcion: b.descripcion,
            icono: b.icono || 'check_circle'
        }));

        if (listaBeneficios.length === 0) {
            listaBeneficios = this.obtenerBeneficiosPredeterminados(membresia.tipoMembresia?.nombre || '');
        }

        return {
            encontrado: true,
            cliente: {
                id: cliente.id,
                nombreCompleto,
                codigoAcceso
            },
            tieneMembresia: esActiva,
            membresia: {
                id: membresia.id,
                plan: membresia.tipoMembresia?.nombre || 'Membresía General',
                descripcionPlan: membresia.tipoMembresia?.descripcion || '',
                precio: Number(membresia.tipoMembresia?.precio || 0),
                duracionDias: membresia.tipoMembresia?.duracionDias || 30,
                estado: membresia.estadoMembresia?.nombre || (esActiva ? 'Vigente' : 'Inactiva'),
                colorEstado: membresia.estadoMembresia?.color || (esActiva ? '#2b8a3e' : '#e03131'),
                fechaInicio: membresia.fechaInicio ? membresia.fechaInicio.toISOString().split('T')[0] : null,
                fechaFin: membresia.fechaFin ? membresia.fechaFin.toISOString().split('T')[0] : null,
                diasRestantes,
                renovacionAutomatica: Boolean(membresia.renovacionAutomatica),
                beneficios: listaBeneficios
            }
        };
    }

    /**
     * Consulta el estado financiero y saldo pendiente de la membresía.
     */
    async getMiSaldo(usuarioId, clienteIdParam = null) {
        await clienteMembresiaDao.sincronizarEstadosVencidos();

        const cliente = await this.obtenerClientePorUsuario(usuarioId, clienteIdParam);
        if (!cliente) {
            return {
                encontrado: false,
                mensaje: 'Perfil de cliente no encontrado'
            };
        }

        // Buscar membresía vigente más reciente
        const activa = await prisma.clienteMembresia.findFirst({
            where: {
                clienteId: cliente.id,
                estadoMembresia: { nombre: 'Vigente' },
                deletedAt: null
            },
            include: {
                tipoMembresia: true,
                estadoMembresia: true
            },
            orderBy: { fechaFin: 'desc' }
        });

        const nombreCompleto = `${cliente.nombre} ${cliente.apellidoPaterno} ${cliente.apellidoMaterno || ''}`.trim();

        if (activa) {
            const precio = Number(activa.tipoMembresia?.precio || 0);
            return {
                encontrado: true,
                clienteId: cliente.id,
                clienteNombre: nombreCompleto,
                alCorriente: true,
                saldoPendiente: 0.00,
                moneda: 'MXN',
                estadoCuenta: 'Al corriente',
                proximoVencimiento: activa.fechaFin ? activa.fechaFin.toISOString().split('T')[0] : null,
                proximoMontoAPagar: precio,
                desglose: [
                    {
                        concepto: activa.tipoMembresia?.nombre || 'Membresía Gym',
                        periodo: `${activa.fechaInicio.toISOString().split('T')[0]} al ${activa.fechaFin.toISOString().split('T')[0]}`,
                        monto: precio,
                        estado: 'PAGADO'
                    }
                ]
            };
        }

        // Si no está activa, buscar la última membresía vencida
        const ultima = await prisma.clienteMembresia.findFirst({
            where: {
                clienteId: cliente.id,
                deletedAt: null
            },
            include: {
                tipoMembresia: true,
                estadoMembresia: true
            },
            orderBy: { fechaFin: 'desc' }
        });

        if (ultima) {
            const precioRenovacion = Number(ultima.tipoMembresia?.precio || 0);
            return {
                encontrado: true,
                clienteId: cliente.id,
                clienteNombre: nombreCompleto,
                alCorriente: false,
                saldoPendiente: precioRenovacion,
                moneda: 'MXN',
                estadoCuenta: 'Membresía Vencida - Renovación Pendiente',
                proximoVencimiento: ultima.fechaFin ? ultima.fechaFin.toISOString().split('T')[0] : null,
                proximoMontoAPagar: precioRenovacion,
                desglose: [
                    {
                        concepto: `Renovación de ${ultima.tipoMembresia?.nombre || 'Membresía'}`,
                        periodo: `Venció el ${ultima.fechaFin.toISOString().split('T')[0]}`,
                        monto: precioRenovacion,
                        estado: 'PENDIENTE'
                    }
                ]
            };
        }

        // Sin membresías previas
        return {
            encontrado: true,
            clienteId: cliente.id,
            clienteNombre: nombreCompleto,
            alCorriente: true,
            saldoPendiente: 0.00,
            moneda: 'MXN',
            estadoCuenta: 'Sin membresía activa',
            proximoVencimiento: null,
            proximoMontoAPagar: 0.00,
            desglose: []
        };
    }

    /**
     * Obtiene el catálogo de planes activos con sus beneficios.
     */
    async getPlanesDisponibles() {
        const planes = await prisma.tipoMembresia.findMany({
            where: {
                deletedAt: null,
                estado: 'activo'
            },
            include: {
                beneficios: {
                    where: { deletedAt: null }
                }
            },
            orderBy: { precio: 'asc' }
        });

        return planes.map(p => {
            let beneficios = (p.beneficios || []).map(b => ({
                id: b.id,
                titulo: b.titulo,
                descripcion: b.descripcion,
                icono: b.icono || 'check_circle'
            }));

            if (beneficios.length === 0) {
                beneficios = this.obtenerBeneficiosPredeterminados(p.nombre);
            }

            return {
                id: p.id,
                nombre: p.nombre,
                descripcion: p.descripcion,
                duracionDias: p.duracionDias,
                precio: Number(p.precio),
                beneficios
            };
        });
    }
}

export const appMembresiaDao = new AppMembresiaDao();
