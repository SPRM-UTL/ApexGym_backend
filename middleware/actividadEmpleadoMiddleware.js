import {
    debeNotificarActividadEmpleado,
    notificarActividadEmpleado,
} from '../services/notificacionesActividadEmpleado.js';

/**
 * Crea un middleware Express que registra actividad de empleados desde Android
 * tras completarse una mutación exitosa (2xx) sin bloquear la respuesta HTTP.
 * Se apoya en el evento `finish` de `res`, momento en el que `req.usuario` ya fue resuelto.
 */
export function crearActividadEmpleadoMiddleware({
    notificar = notificarActividadEmpleado,
} = {}) {
    return function actividadEmpleadoMiddleware(req, res, next) {
        res.on('finish', () => {
            const ruta = req.originalUrl
                ? String(req.originalUrl).split('?')[0]
                : `${req.baseUrl || ''}${req.path || ''}`;
            const usuario = req.usuario ?? req.user ?? null;

            if (!debeNotificarActividadEmpleado({
                method: req.method,
                path: ruta,
                statusCode: res.statusCode,
                headers: req.headers,
                body: req.body,
                usuario,
            })) {
                return;
            }

            const empresaId = Number(req.headers?.['x-empresa-id'] ?? usuario?.empresaId ?? 1) || 1;
            const rawSucursal = req.headers?.['x-sucursal-id'] ?? req.query?.sucursalId ?? usuario?.sucursalId;
            const sucursalId = rawSucursal && rawSucursal !== 'todas' && Number(rawSucursal) > 0
                ? Number(rawSucursal)
                : null;

            Promise.resolve()
                .then(() => notificar({
                    method: req.method,
                    path: ruta,
                    usuario,
                    empresaId,
                    sucursalId,
                }))
                .catch((error) => {
                    console.error('[ActividadEmpleado Middleware Error]:', error?.message ?? error);
                });
        });

        next();
    };
}

export const actividadEmpleadoMiddleware = crearActividadEmpleadoMiddleware();
