const KEEP_ALIVE_MS = 25_000;
const suscriptoresPorUsuario = new Map();

function enviarEventoRaw(res, evento, data) {
    if (!res || res.writableEnded || res.destroyed) return false;
    try {
        const payload = typeof data === 'string' ? data : JSON.stringify(data);
        res.write(`event: ${evento}\ndata: ${payload}\n\n`);
        return true;
    } catch {
        return false;
    }
}

/**
 * Registra una respuesta HTTP como stream Server-Sent Events (SSE) para un usuario autenticado.
 * Emite un keepalive cada 25 segundos para mantener viva la conexión en proxies/navegadores.
 */
export function registrarClienteSse(usuarioId, req, res) {
    const uid = Number(usuarioId);
    if (!Number.isSafeInteger(uid) || uid < 1) {
        return () => {};
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    let clientes = suscriptoresPorUsuario.get(uid);
    if (!clientes) {
        clientes = new Set();
        suscriptoresPorUsuario.set(uid, clientes);
    }
    clientes.add(res);

    enviarEventoRaw(res, 'conectado', {
        conectado: true,
        usuarioId: uid,
        timestamp: new Date().toISOString(),
    });

    const keepaliveTimer = setInterval(() => {
        if (res.writableEnded || res.destroyed) {
            limpiar();
            return;
        }
        try {
            res.write(': keepalive\n\n');
        } catch {
            limpiar();
        }
    }, KEEP_ALIVE_MS);
    keepaliveTimer.unref?.();

    let cerrado = false;
    const limpiar = () => {
        if (cerrado) return;
        cerrado = true;
        clearInterval(keepaliveTimer);
        const grupo = suscriptoresPorUsuario.get(uid);
        if (grupo) {
            grupo.delete(res);
            if (grupo.size === 0) {
                suscriptoresPorUsuario.delete(uid);
            }
        }
    };

    req?.on?.('close', limpiar);
    res?.on?.('close', limpiar);
    res?.on?.('error', limpiar);

    return limpiar;
}

/**
 * Publica una notificación en tiempo real a todas las sesiones SSE activas del usuario.
 */
export function publicarEventoNotificacion(usuarioId, payload) {
    const uid = Number(usuarioId);
    if (!Number.isSafeInteger(uid) || uid < 1) return 0;

    const clientes = suscriptoresPorUsuario.get(uid);
    if (!clientes || clientes.size === 0) return 0;

    let entregados = 0;
    for (const res of Array.from(clientes)) {
        const ok = enviarEventoRaw(res, 'notificacion', payload);
        if (ok) {
            entregados += 1;
        } else {
            clientes.delete(res);
        }
    }

    if (clientes.size === 0) {
        suscriptoresPorUsuario.delete(uid);
    }
    return entregados;
}

export function contarSuscriptoresSse(usuarioId = null) {
    if (usuarioId !== null && usuarioId !== undefined) {
        return suscriptoresPorUsuario.get(Number(usuarioId))?.size ?? 0;
    }
    let total = 0;
    for (const grupo of suscriptoresPorUsuario.values()) {
        total += grupo.size;
    }
    return total;
}
