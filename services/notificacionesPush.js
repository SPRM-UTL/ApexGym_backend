import { prisma } from '../dao/BaseDao.js';
import { firebaseMessaging } from './firebaseAdmin.js';
import { publicarEventoNotificacion } from './notificacionesStream.js';

const TAMANO_LOTE_FCM = 500;
const CODIGOS_TOKEN_INVALIDO = new Set([
    'messaging/invalid-registration-token',
    'messaging/registration-token-not-registered',
]);

export async function enviarPushNotificacion({
    notificacion,
    destinatarioUsuarioId,
    prismaClient = prisma,
    messaging = firebaseMessaging,
    publicarSse = publicarEventoNotificacion,
}) {
    if (destinatarioUsuarioId && notificacion && typeof publicarSse === 'function') {
        try {
            publicarSse(destinatarioUsuarioId, {
                tipo: 'NUEVA_NOTIFICACION',
                notificacion,
            });
        } catch {
            // No bloquear flujo push por error de stream SSE
        }
    }

    if (!messaging || !destinatarioUsuarioId) return { enviados: 0, eliminados: 0 };

    const dispositivos = await prismaClient.dispositivo.findMany({
        where: {
            empresaId: notificacion.empresaId,
            usuarioId: destinatarioUsuarioId,
            tipo: notificacion.destinatarioTipo,
        },
        select: { token: true },
    });
    const tokens = dispositivos
        .map(({ token }) => token)
        .filter((token) => typeof token === 'string' && token.trim() && !token.startsWith('web-'));
    let enviados = 0;
    let eliminados = 0;

    for (let inicio = 0; inicio < tokens.length; inicio += TAMANO_LOTE_FCM) {
        const lote = tokens.slice(inicio, inicio + TAMANO_LOTE_FCM);
        const resultado = await messaging.sendEachForMulticast({
            tokens: lote,
            notification: {
                title: notificacion.titulo,
                body: notificacion.mensaje,
            },
            data: {
                notificacionId: String(notificacion.id),
                tipo: notificacion.tipo,
            },
        });

        enviados += resultado.successCount;
        const tokensInvalidos = resultado.responses.flatMap((respuesta, indice) => (
            !respuesta.success && CODIGOS_TOKEN_INVALIDO.has(respuesta.error?.code)
                ? [lote[indice]]
                : []
        ));
        if (tokensInvalidos.length) {
            const eliminacion = await prismaClient.dispositivo.deleteMany({
                where: { token: { in: tokensInvalidos } },
            });
            eliminados += eliminacion.count;
        }
    }

    return { enviados, eliminados };
}
