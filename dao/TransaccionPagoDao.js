import { BaseDao, prisma } from './BaseDao.js';

export class TransaccionPagoDao extends BaseDao {
    constructor() {
        super('transaccionPago', {
            useEmpresa: true,
            omit: {
                createdAt: false,
                deletedAt: true,
            },
        });
    }

    /**
     * Busca una transacción por su llave de idempotencia dentro de la empresa.
     */
    async buscarPorIdempotencia(uuidIdempotencia, empresaId = 1) {
        const idEmpresa = this.resolverEmpresaId(empresaId);
        return this.model.findFirst({
            where: {
                uuidIdempotencia,
                empresaId: idEmpresa,
                deletedAt: null,
            },
        });
    }

    /**
     * Actualiza el estado de una transacción.
     */
    async actualizarEstado(id, nuevoEstado, datosRespuesta = null, empresaId = 1) {
        const idEmpresa = this.resolverEmpresaId(empresaId);
        return this.model.update({
            where: {
                id: Number(id),
                empresaId: idEmpresa,
            },
            data: {
                estado: nuevoEstado,
                ...(datosRespuesta ? { datosRespuesta: typeof datosRespuesta === 'string' ? datosRespuesta : JSON.stringify(datosRespuesta) } : {}),
            },
        });
    }

    /**
     * Obtiene estadísticas rápidas de pagos para auditoría.
     */
    async obtenerResumen(empresaId = 1) {
        const idEmpresa = this.resolverEmpresaId(empresaId);
        const transacciones = await this.model.findMany({
            where: {
                empresaId: idEmpresa,
                deletedAt: null,
            },
            select: {
                monto: true,
                estado: true,
                proveedor: true,
            },
        });

        const resumen = {
            totalAprobado: 0,
            totalPendiente: 0,
            totalReembolsado: 0,
            conteoPorProveedor: {},
        };

        for (const t of transacciones) {
            const montoNum = Number(t.monto) || 0;
            if (t.estado === 'APROBADO') resumen.totalAprobado += montoNum;
            else if (t.estado === 'PENDIENTE') resumen.totalPendiente += montoNum;
            else if (t.estado === 'REEMBOLSADO') resumen.totalReembolsado += montoNum;

            resumen.conteoPorProveedor[t.proveedor] = (resumen.conteoPorProveedor[t.proveedor] || 0) + 1;
        }

        return resumen;
    }
}

export const transaccionPagoDao = new TransaccionPagoDao();
