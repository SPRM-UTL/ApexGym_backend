export const TASA_IVA = 0.16;
export const ESTADOS_ACTIVOS_CATALOGO = Object.freeze(['ACTIVO']);
export const ESTADOS_CATALOGO = Object.freeze(['ACTIVO', 'INACTIVO']);

export function normalizarEstadoCatalogo(valor, valorPorDefecto = 'ACTIVO') {
    if (valor === undefined || valor === null || valor === '') {
        return valorPorDefecto;
    }

    return String(valor).trim().toUpperCase() || valorPorDefecto;
}

export function validarEstadoCatalogo(valor) {
    const estado = normalizarEstadoCatalogo(valor);
    if (!ESTADOS_CATALOGO.includes(estado)) {
        throw new Error('El estado debe ser ACTIVO o INACTIVO');
    }

    return estado;
}
