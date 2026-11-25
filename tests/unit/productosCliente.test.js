import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { ProductoController } from '../../controller/ProductoController.js';
import { productoDao } from '../../dao/ProductoDao.js';
import { pool } from '../../dao/BaseDao.js';

after(() => pool.end());

function crearRespuesta() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };
}

test('ProductoController.obtenerDisponiblesParaVenta conserva productos agotados en el filtro de catalogo cliente', async () => {
    const controller = new ProductoController();
    const originalGetAll = productoDao.getAll.bind(productoDao);
    let filtroConsultado = null;
    const productosMock = [
        { id: 1, nombre: 'Creatina 300g', stockActual: 10, disponibleCompra: true, estado: 'ACTIVO' },
        { id: 2, nombre: 'Proteina Agotada', stockActual: 0, disponibleCompra: true, estado: 'ACTIVO' },
    ];

    productoDao.getAll = async (where) => {
        filtroConsultado = where;
        return productosMock;
    };

    try {
        const res = crearRespuesta();
        await controller.obtenerDisponiblesParaVenta({
            headers: { 'x-sucursal-id': '1' },
            query: {},
            usuario: { empresaId: 1, sucursalId: 1 },
        }, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.data.length, 2);
        assert.deepEqual(filtroConsultado, {
            disponibleCompra: true,
            estado: 'ACTIVO',
        });
        assert.equal('stockActual' in filtroConsultado, false);
    } finally {
        productoDao.getAll = originalGetAll;
    }
});
