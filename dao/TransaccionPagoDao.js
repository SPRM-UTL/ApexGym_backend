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

}

export const transaccionPagoDao = new TransaccionPagoDao();
