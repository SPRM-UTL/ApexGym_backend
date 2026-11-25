import { prisma } from '../dao/BaseDao.js';
import { enviarPushNotificacion } from './notificacionesPush.js';

export const TIPO_NOTIFICACION_ACTIVIDAD_EMPLEADO = 'ACTIVIDAD_EMPLEADO';

const METODOS_MUTACION = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const ETIQUETAS_RECURSO = {
    ventas: 'Venta',
    visitas: 'Visita',
    asistencias: 'Asistencia',
    clientes: 'Cliente',
    'clientes-membresias': 'Membresía de cliente',
    'pedidos-compra': 'Pedido de compra',
    almacenes: 'Almacén',
    productos: 'Producto',
    servicios: 'Servicio',
    cajas: 'Caja',
    'aperturas-caja': 'Apertura de caja',
    'movimientos-caja': 'Movimiento de caja',
    'cortes-caja': 'Corte de caja',
    empleados: 'Empleado',
    pagos: 'Pago',
};

const VERBOS_METODO = {
    POST: 'registró',
    PUT: 'actualizó',
    PATCH: 'modificó',
    DELETE: 'eliminó',
};

export function esPlataformaAndroid({ headers = {}, body = {} } = {}) {
    const origenHeader = headers['x-plataforma'] ?? headers['x-client-platform'];
    const origenBody = body?.plataforma ?? body?.origen;
    return [origenHeader, origenBody].some(
        (valor) => typeof valor === 'string' && valor.trim().toUpperCase() === 'ANDROID'
    );
}

export function normalizarRutaApi(rawPath = '') {
    const sinQuery = String(rawPath).split('?')[0].trim();
    const sinApi = sinQuery.startsWith('/api/')
        ? sinQuery.slice(4)
        : sinQuery === '/api'
            ? '/'
            : sinQuery;
    const conBarra = sinApi.startsWith('/') ? sinApi : `/${sinApi}`;
    return conBarra.length > 1 ? conBarra.replace(/\/+$/, '') : conBarra;
}

export function esRutaExcluidaActividad(rawPath = '') {
    const ruta = normalizarRutaApi(rawPath);
    if (ruta === '/usuarios/verificarCredenciales') return true;
    if (ruta === '/usuarios/login-movil' || ruta === '/usuarios/login-mobile') return true;
    if (ruta === '/usuarios/logout' || ruta === '/usuarios/logout-movil') return true;
    if (ruta === '/dispositivos' || ruta.startsWith('/dispositivos/')) return true;
    if (ruta === '/notificaciones' || ruta.startsWith('/notificaciones/')) return true;
    if (ruta === '/asistencias/validar-qr') return true;
    if (/^\/pedidos-compra\/[^/]+\/(aprobar|rechazar)$/.test(ruta)) return true;
    return false;
}

export function debeNotificarActividadEmpleado({
    method,
    path,
    statusCode,
    headers = {},
    body = {},
    usuario = null,
}) {
    const metodo = String(method ?? '').toUpperCase();
    if (!METODOS_MUTACION.has(metodo)) return false;

    const status = Number(statusCode);
    if (!Number.isFinite(status) || status < 200 || status >= 300) return false;

    if (!usuario?.id || usuario?.esCliente) return false;
    if (!esPlataformaAndroid({ headers, body })) return false;
    if (esRutaExcluidaActividad(path)) return false;

    return true;
}

function describirAccionAndroid(method, rutaNormalizada) {
    const metodo = String(method ?? 'POST').toUpperCase();
    const segmentos = rutaNormalizada.split('/').filter(Boolean);
    const recursoSlug = segmentos[0] ?? 'sistema';
    const recurso = ETIQUETAS_RECURSO[recursoSlug] ?? recursoSlug.replace(/-/g, ' ');
    const verbo = VERBOS_METODO[metodo] ?? 'operó';

    if (rutaNormalizada.endsWith('/transferir')) {
        return {
            titulo: 'Android: Transferencia de inventario',
            accionTexto: 'realizó una transferencia de stock entre almacenes',
        };
    }
    if (rutaNormalizada.includes('/sincronizar-offline')) {
        return {
            titulo: 'Android: Sincronización de ventas offline',
            accionTexto: 'sincronizó ventas offline en efectivo',
        };
    }
    if (rutaNormalizada.endsWith('/cancelar')) {
        return {
            titulo: `Android: Cancelación de ${recurso.toLowerCase()}`,
            accionTexto: `canceló un registro de ${recurso.toLowerCase()}`,
        };
    }

    return {
        titulo: `Android: ${recurso} (${metodo})`,
        accionTexto: `${verbo} un registro en ${recurso}`,
    };
}

function esRolSupervisorOAdmin(rol) {
    if (!rol || rol.deletedAt) return false;
    const nombre = String(rol.nombre ?? '').trim().toLowerCase();
    if (!nombre || nombre === 'cliente') return false;
    if (/admin|supervisor|gerente|encargado/.test(nombre)) return true;

    const permisos = Array.isArray(rol.permisos) ? rol.permisos : [];
    return permisos.some((rp) => {
        const modNombre = String(rp?.permiso?.modulo?.nombre ?? '').trim();
        return modNombre === 'Dashboard y Reportes' || modNombre === 'Administración de roles';
    });
}

export async function obtenerSupervisoresDestinatarios({
    empresaId = 1,
    actorUsuarioId = null,
    prismaClient = prisma,
}) {
    const usuarios = await prismaClient.usuario.findMany({
        where: {
            empresaId: Number(empresaId) || 1,
            deletedAt: null,
            ...(actorUsuarioId ? { id: { not: Number(actorUsuarioId) } } : {}),
            usuarioRols: {
                some: {
                    deletedAt: null,
                    rol: {
                        deletedAt: null,
                        nombre: { not: 'Cliente' },
                    },
                },
            },
        },
        select: {
            id: true,
            nombre: true,
            usuarioRols: {
                where: { deletedAt: null },
                include: {
                    rol: {
                        include: {
                            permisos: {
                                where: { deletedAt: null },
                                include: {
                                    permiso: {
                                        include: {
                                            modulo: { select: { nombre: true } },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            empleados: {
                where: { empresaId: Number(empresaId) || 1, deletedAt: null },
                orderBy: { id: 'asc' },
                take: 1,
                select: { id: true },
            },
        },
    });

    return usuarios
        .filter((u) => u.usuarioRols.some((ur) => esRolSupervisorOAdmin(ur.rol)))
        .map((u) => {
            const empleadoId = u.empleados?.[0]?.id ?? null;
            return empleadoId
                ? { destinatarioId: empleadoId, destinatarioTipo: 'EMPLEADO', usuarioId: u.id }
                : { destinatarioId: u.id, destinatarioTipo: 'USUARIO', usuarioId: u.id };
        });
}

export async function notificarActividadEmpleado({
    method,
    path,
    usuario,
    empresaId = 1,
    sucursalId = null,
    prismaClient = prisma,
    enviarPush = enviarPushNotificacion,
}) {
    const empId = Number(empresaId || usuario?.empresaId || 1);
    const sucId = sucursalId && sucursalId !== 'todas' ? Number(sucursalId) : null;
    const actorUsuarioId = Number(usuario?.id);
    const rutaNormalizada = normalizarRutaApi(path);
    const { titulo, accionTexto } = describirAccionAndroid(method, rutaNormalizada);
    const nombreActor = typeof usuario?.nombre === 'string' && usuario.nombre.trim()
        ? usuario.nombre.trim()
        : `Usuario #${actorUsuarioId}`;
    const sufijoSucursal = sucId ? ` (Sucursal #${sucId})` : '';
    const mensaje = `${nombreActor} ${accionTexto} desde la app Android (${method} ${rutaNormalizada})${sufijoSucursal}.`;

    const destinatarios = await obtenerSupervisoresDestinatarios({
        empresaId: empId,
        actorUsuarioId: Number.isSafeInteger(actorUsuarioId) ? actorUsuarioId : null,
        prismaClient,
    });

    if (destinatarios.length === 0) {
        return { creadas: 0, notificaciones: [] };
    }

    const remitenteId = Number.isSafeInteger(Number(usuario?.empleadoId)) && Number(usuario.empleadoId) > 0
        ? Number(usuario.empleadoId)
        : null;

    const resultados = await Promise.all(
        destinatarios.map(async (dest) => {
            try {
                const notificacion = await prismaClient.notificacion.create({
                    data: {
                        empresaId: empId,
                        titulo: titulo.slice(0, 150),
                        mensaje,
                        tipo: TIPO_NOTIFICACION_ACTIVIDAD_EMPLEADO,
                        destinatarioId: dest.destinatarioId,
                        destinatarioTipo: dest.destinatarioTipo,
                        remitenteId,
                        sucursalId: sucId,
                    },
                });

                try {
                    await enviarPush({
                        notificacion,
                        destinatarioUsuarioId: dest.usuarioId,
                        prismaClient,
                    });
                } catch (errorPush) {
                    console.error('[ActividadEmpleado Push Error]:', errorPush?.code ?? 'envío fallido');
                }

                return notificacion;
            } catch (errorNotif) {
                console.error('[ActividadEmpleado Notif Error]:', errorNotif?.code ?? errorNotif?.message ?? 'creación fallida');
                return null;
            }
        })
    );

    const notificaciones = resultados.filter(Boolean);
    return { creadas: notificaciones.length, notificaciones };
}
