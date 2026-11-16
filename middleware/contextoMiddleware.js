import { AsyncLocalStorage } from 'node:async_hooks';

export const contextStorage = new AsyncLocalStorage();

/**
 * Middleware para capturar y propagar de forma transparente el contexto de
 * empresaId y sucursalId a través de toda la pila de ejecución asíncrona.
 */
export function contextoMiddleware(req, res, next) {
    const rawEmpresa =
        req.headers['x-empresa-id'] ??
        req.query?.empresaId ??
        req.user?.empresaId ??
        req.usuario?.empresaId ??
        1;
    const empresaId = Number(rawEmpresa) > 0 ? Number(rawEmpresa) : 1;

    const rawSucursal =
        req.headers['x-sucursal-id'] ??
        req.query?.sucursalId ??
        req.user?.sucursalId ??
        req.usuario?.sucursalId;

    let sucursalId = 1;
    if (rawSucursal === 'todas') {
        sucursalId = null; // null = ver todas las sucursales si tiene permiso
    } else if (rawSucursal !== undefined && rawSucursal !== null && rawSucursal !== '') {
        const parsed = Number(rawSucursal);
        sucursalId = Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
    }

    contextStorage.run({ empresaId, sucursalId }, () => {
        next();
    });
}
