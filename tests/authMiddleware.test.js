import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { permisoDao } from '../dao/PermisoDao.js';
import { verificarEmpleado, verificarPermiso } from '../middleware/authMiddleware.js';

const originalEsCliente = permisoDao.esCliente;
const originalObtenerPermisosEfectivos = permisoDao.obtenerPermisosEfectivos;

afterEach(() => {
    permisoDao.esCliente = originalEsCliente;
    permisoDao.obtenerPermisosEfectivos = originalObtenerPermisosEfectivos;
});

function mockResponse() {
    return {
        statusCode: null,
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

test('cliente autenticado recibe 403 en módulos protegidos por permiso', async () => {
    permisoDao.esCliente = async () => true;
    const req = { usuario: { id: 17 }, method: 'GET' };
    const res = mockResponse();
    let nextCalled = false;

    await verificarPermiso('Usuarios', 'Listar')(req, res, () => { nextCalled = true; });

    assert.equal(res.statusCode, 403);
    assert.equal(nextCalled, false);
});

test('cliente autenticado recibe 403 en rutas internas sin permiso granular', async () => {
    permisoDao.esCliente = async () => true;
    const req = { usuario: { id: 17 } };
    const res = mockResponse();
    let nextCalled = false;

    await verificarEmpleado(req, res, () => { nextCalled = true; });

    assert.equal(res.statusCode, 403);
    assert.equal(nextCalled, false);
});

test('empleado puede pasar el control de rol en rutas internas', async () => {
    permisoDao.esCliente = async () => false;
    const req = { usuario: { id: 23 } };
    const res = mockResponse();
    let nextCalled = false;

    await verificarEmpleado(req, res, () => { nextCalled = true; });

    assert.equal(res.statusCode, null);
    assert.equal(nextCalled, true);
});
