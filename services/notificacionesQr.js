import { prisma } from '../dao/BaseDao.js';
import { enviarPushNotificacion } from './notificacionesPush.js';

export const TIPO_NOTIFICACION_QR = 'ACCESO_QR';

/**
 * Determina si la revisión de QR se solicitó desde la app Android.
 */
export function esEscaneoDesdeAndroid(req) {
    const origenBody = req?.body?.plataforma ?? req?.body?.origen;
    const origenHeader = req?.headers?.['x-plataforma'] ?? req?.headers?.['x-client-platform'];

    return [origenBody, origenHeader].some(
        (valor) => typeof valor === 'string' && valor.trim().toUpperCase() === 'ANDROID'
    );
}

function formatearNombreCliente(cliente) {
    return [cliente?.nombre, cliente?.apellidoPaterno, cliente?.apellidoMaterno]
        .filter((valor) => typeof valor === 'string' && valor.trim())
        .map((valor) => valor.trim())
        .join(' ') || 'Socio';
}

function formatearDiasRestantes(diasRestantes) {
    const dias = Number.isFinite(Number(diasRestantes))
        ? Math.max(0, Math.trunc(Number(diasRestantes)))
        : 0;
    return dias === 1 ? '1 día restante' : `${dias} días restantes`;
}

function construirMensajesRevisionQr({
    cliente,
    acceso,
    mensajeDetalle,
    membresia,
    diasRestantes,
}) {
    const nombreCliente = formatearNombreCliente(cliente);
    const nombrePlan = membresia?.tipoMembresia?.nombre?.trim() || 'Membresía activa';

    if (acceso === true) {
        const textoDias = formatearDiasRestantes(diasRestantes);
        return {
            cliente: {
                titulo: 'Revisión de pase QR aprobada',
                mensaje: `Tu código QR fue revisado con acceso autorizado (${nombrePlan}, ${textoDias}).`,
            },
            escaneador: {
                titulo: 'QR revisado: acceso autorizado',
                mensaje: `Revisaste el pase QR de ${nombreCliente}. Membresía vigente (${nombrePlan}, ${textoDias}).`,
            },
        };
    }

    const detalle = (typeof mensajeDetalle === 'string' && mensajeDetalle.trim())
        ? mensajeDetalle.trim()
        : 'Membresía no vigente';

    return {
        cliente: {
            titulo: 'Revisión de pase QR denegada',
            mensaje: `Tu código QR fue revisado, pero el acceso fue denegado: ${detalle}.`,
        },
        escaneador: {
            titulo: 'QR revisado: acceso denegado',
            mensaje: `Revisaste el pase QR de ${nombreCliente}. Acceso denegado: ${detalle}.`,
        },
    };
}

function normalizarEnteroPositivo(valor) {
    const numero = Number(valor);
    return valor != null && Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

/**
 * Registra notificaciones y envía push FCM tras validar un QR:
 * siempre al socio escaneado, y al empleado escaneador cuando proviene de Android.
 */
export async function notificarRevisionQr({
    cliente,
    acceso,
    mensajeDetalle = '',
    membresia = null,
    diasRestantes = 0,
    scannerUsuarioId = null,
    empresaId = 1,
    sucursalId = null,
    desdeAndroid = false,
    prismaClient = prisma,
    enviarPush = enviarPushNotificacion,
}) {
    if (!cliente?.id) {
        return { notificacionCliente: null, notificacionEscaneador: null };
    }

    const empresaIdNorm = normalizarEnteroPositivo(empresaId)
        ?? normalizarEnteroPositivo(cliente.empresaId)
        ?? 1;
    const sucursalIdNorm = normalizarEnteroPositivo(sucursalId)
        ?? normalizarEnteroPositivo(cliente.sucursalId);
    const scannerUsuarioIdNorm = normalizarEnteroPositivo(scannerUsuarioId);

    let empleadoEscaneador = null;
    if (scannerUsuarioIdNorm) {
        try {
            empleadoEscaneador = await prismaClient.empleado.findFirst({
                where: {
                    usuarioId: scannerUsuarioIdNorm,
                    empresaId: empresaIdNorm,
                    deletedAt: null,
                },
                select: { id: true, usuarioId: true, sucursalId: true },
            });
        } catch (error) {
            console.error('[Notificaciones QR Empleado Error]:', error?.code ?? error?.message ?? 'consulta fallida');
        }
    }

    const mensajes = construirMensajesRevisionQr({
        cliente,
        acceso,
        mensajeDetalle,
        membresia,
        diasRestantes,
    });

    const crearYNotificar = async ({
        empresaIdDest,
        sucursalIdDest,
        destinatarioId,
        destinatarioTipo,
        destinatarioUsuarioId,
        remitenteId,
        titulo,
        mensaje,
    }) => {
        let notificacion = null;
        try {
            notificacion = await prismaClient.notificacion.create({
                data: {
                    empresaId: empresaIdDest,
                    titulo: titulo.slice(0, 150),
                    mensaje,
                    tipo: TIPO_NOTIFICACION_QR,
                    destinatarioId,
                    destinatarioTipo,
                    remitenteId,
                    sucursalId: sucursalIdDest,
                },
            });
        } catch (error) {
            console.error('[Notificaciones QR Error]:', error?.code ?? error?.message ?? 'creación fallida');
            return null;
        }

        try {
            await enviarPush({
                notificacion,
                destinatarioUsuarioId,
                prismaClient,
            });
        } catch (error) {
            console.error('[Notificaciones QR Push Error]:', error?.code ?? 'envío fallido');
        }

        return notificacion;
    };

    const empresaCliente = normalizarEnteroPositivo(cliente.empresaId) ?? empresaIdNorm;
    const sucursalCliente = sucursalIdNorm ?? normalizarEnteroPositivo(cliente.sucursalId);

    const promesaCliente = crearYNotificar({
        empresaIdDest: empresaCliente,
        sucursalIdDest: sucursalCliente,
        destinatarioId: cliente.id,
        destinatarioTipo: 'CLIENTE',
        destinatarioUsuarioId: cliente.usuarioId ?? null,
        remitenteId: empleadoEscaneador?.id ?? null,
        titulo: mensajes.cliente.titulo,
        mensaje: mensajes.cliente.mensaje,
    });

    const promesaEscaneador = Boolean(desdeAndroid) && empleadoEscaneador?.id
        ? crearYNotificar({
            empresaIdDest: empresaIdNorm,
            sucursalIdDest: sucursalIdNorm ?? normalizarEnteroPositivo(empleadoEscaneador.sucursalId),
            destinatarioId: empleadoEscaneador.id,
            destinatarioTipo: 'EMPLEADO',
            destinatarioUsuarioId: empleadoEscaneador.usuarioId ?? scannerUsuarioIdNorm,
            remitenteId: empleadoEscaneador.id,
            titulo: mensajes.escaneador.titulo,
            mensaje: mensajes.escaneador.mensaje,
        })
        : Promise.resolve(null);

    const [notificacionCliente, notificacionEscaneador] = await Promise.all([
        promesaCliente,
        promesaEscaneador,
    ]);

    return { notificacionCliente, notificacionEscaneador };
}
