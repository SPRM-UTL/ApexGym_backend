import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarServidor, detenerServidor, peticion, obtenerToken, EMAIL } from './helpers.js';
import { publicos, protegidos } from './endpoints.js';

let token;
const resumen = [];

before(async () => {
    await iniciarServidor();
    token = await obtenerToken();
});

after(() => {
    detenerServidor();
    console.log(`\n=== Matriz de privilegios de ${EMAIL} ===`);
    console.table(resumen);
});

test('Autenticacion: el login valido entrega token', () => {
    assert.ok(token);
});

for (const e of publicos) {
    test(`[publico] ${e.nombre}`, async () => {
        const r = await peticion(e.metodo, e.ruta, { body: e.body });
        assert.equal(r.status, e.esperado);
    });
}

for (const e of protegidos) {
    test(`[sin token] ${e.nombre} rechaza acceso`, async () => {
        const r = await peticion(e.metodo, e.ruta);
        assert.equal(r.status, 401);
    });
    test(`[con token] ${e.nombre} -> privilegio del usuario`, async () => {
        const r = await peticion(e.metodo, e.ruta, { token });
        const acceso = r.status === e.esperado ? 'PERMITIDO' : r.status === 403 ? 'DENEGADO (sin privilegio)' : 'ERROR';
        resumen.push({ ruta: e.ruta, status: r.status, acceso });
        assert.ok([e.esperado, 403].includes(r.status), `Estado inesperado ${r.status}: ${JSON.stringify(r.json)?.slice(0, 200)}`);
    });
}
