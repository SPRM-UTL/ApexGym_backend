import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { ServicioController } from '../../controller/ServicioController.js';
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

test('obtenerDisponiblesParaVenta limita servicios a la empresa y sucursal solicitadas', async () => {
    const controller = new ServicioController();
    const servicios = [{ id: 8, nombre: 'Servicio de esta sucursal' }];
    let contextoConsultado;
    controller.dao = {
        async obtenerDisponiblesParaVenta(empresaId, sucursalId) {
            contextoConsultado = { empresaId, sucursalId };
            return servicios;
        },
    };

    const res = crearRespuesta();
    await controller.obtenerDisponiblesParaVenta({
        headers: { 'x-sucursal-id': '6' },
        query: {},
        user: { empresaId: 4 },
    }, res);

    assert.deepEqual(contextoConsultado, { empresaId: 4, sucursalId: 6 });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.data, servicios);
});

test('obtenerDisponiblesParaVenta rechaza la consulta de todas las sucursales', async () => {
    const controller = new ServicioController();
    controller.dao = {
        async obtenerDisponiblesParaVenta() {
            assert.fail('No debe consultar servicios sin sucursal especifica');
        },
    };

    const res = crearRespuesta();
    await controller.obtenerDisponiblesParaVenta({
        headers: { 'x-sucursal-id': 'todas' },
        query: {},
    }, res);

    assert.equal(res.statusCode, 400);
});
