import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../../dao/BaseDao.js';
import { AsistenciaController } from '../../controller/AsistenciaController.js';

after(() => pool.end());
import {
    TIPO_NOTIFICACION_QR,
    esEscaneoDesdeAndroid,
    notificarRevisionQr,
} from '../../services/notificacionesQr.js';

function crearRespuesta() {
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

test('esEscaneoDesdeAndroid detecta plataforma ANDROID en body o headers y descarta otros orígenes', () => {
    assert.equal(esEscaneoDesdeAndroid({ body: { plataforma: 'ANDROID' } }), true);
    assert.equal(esEscaneoDesdeAndroid({ body: { plataforma: ' android ' } }), true);
    assert.equal(esEscaneoDesdeAndroid({ body: { origen: 'Android' } }), true);
    assert.equal(esEscaneoDesdeAndroid({ headers: { 'x-plataforma': 'ANDROID' } }), true);
    assert.equal(esEscaneoDesdeAndroid({ headers: { 'x-client-platform': 'android' } }), true);

    assert.equal(esEscaneoDesdeAndroid({ body: { plataforma: 'WEB' }, headers: {} }), false);
    assert.equal(esEscaneoDesdeAndroid({ body: {}, headers: {} }), false);
    assert.equal(esEscaneoDesdeAndroid(null), false);
});

test('notificarRevisionQr envía notificación y push a cliente y escaneador cuando proviene de Android con acceso autorizado', async () => {
    const creaciones = [];
    const enviosPush = [];
    let siguienteId = 100;

    const resultado = await notificarRevisionQr({
        cliente: {
            id: 25,
            usuarioId: 305,
            empresaId: 1,
            sucursalId: 2,
            nombre: 'Sofía',
            apellidoPaterno: 'López',
        },
        acceso: true,
        membresia: { tipoMembresia: { nombre: 'Plan Black VIP' } },
        diasRestantes: 15,
        scannerUsuarioId: 88,
        empresaId: 1,
        sucursalId: 2,
        desdeAndroid: true,
        prismaClient: {
            empleado: {
                findFirst: async (args) => {
                    assert.deepEqual(args.where, { usuarioId: 88, empresaId: 1, deletedAt: null });
                    return { id: 12, usuarioId: 88, sucursalId: 2 };
                },
            },
            notificacion: {
                create: async ({ data }) => {
                    const creada = { id: ++siguienteId, ...data };
                    creaciones.push(creada);
                    return creada;
                },
            },
        },
        enviarPush: async (args) => {
            enviosPush.push(args);
            return { enviados: 1, eliminados: 0 };
        },
    });

    assert.equal(creaciones.length, 2);
    assert.equal(enviosPush.length, 2);
    assert.equal(resultado.notificacionCliente.destinatarioTipo, 'CLIENTE');
    assert.equal(resultado.notificacionCliente.destinatarioId, 25);
    assert.equal(resultado.notificacionCliente.remitenteId, 12);
    assert.equal(resultado.notificacionCliente.tipo, TIPO_NOTIFICACION_QR);
    assert.match(resultado.notificacionCliente.titulo, /aprobada/i);
    assert.match(resultado.notificacionCliente.mensaje, /Plan Black VIP/);

    assert.equal(resultado.notificacionEscaneador.destinatarioTipo, 'EMPLEADO');
    assert.equal(resultado.notificacionEscaneador.destinatarioId, 12);
    assert.equal(resultado.notificacionEscaneador.remitenteId, 12);
    assert.equal(resultado.notificacionEscaneador.tipo, TIPO_NOTIFICACION_QR);
    assert.match(resultado.notificacionEscaneador.titulo, /autorizado/i);
    assert.match(resultado.notificacionEscaneador.mensaje, /Sofía López/);

    assert.deepEqual(
        enviosPush.map((e) => ({ tipo: e.notificacion.destinatarioTipo, usuarioId: e.destinatarioUsuarioId })),
        [
            { tipo: 'CLIENTE', usuarioId: 305 },
            { tipo: 'EMPLEADO', usuarioId: 88 },
        ]
    );
});

test('notificarRevisionQr solo notifica al cliente escaneado cuando no proviene de Android', async () => {
    const creaciones = [];
    const enviosPush = [];

    const resultado = await notificarRevisionQr({
        cliente: {
            id: 31,
            usuarioId: 401,
            empresaId: 1,
            sucursalId: 1,
            nombre: 'Carlos',
            apellidoPaterno: 'Méndez',
        },
        acceso: true,
        membresia: { tipoMembresia: { nombre: 'Mensualidad' } },
        diasRestantes: 1,
        scannerUsuarioId: 88,
        empresaId: 1,
        sucursalId: 1,
        desdeAndroid: false,
        prismaClient: {
            empleado: {
                findFirst: async () => ({ id: 12, usuarioId: 88, sucursalId: 1 }),
            },
            notificacion: {
                create: async ({ data }) => {
                    const creada = { id: 50, ...data };
                    creaciones.push(creada);
                    return creada;
                },
            },
        },
        enviarPush: async (args) => {
            enviosPush.push(args);
            return { enviados: 1, eliminados: 0 };
        },
    });

    assert.equal(creaciones.length, 1);
    assert.equal(enviosPush.length, 1);
    assert.equal(resultado.notificacionCliente.destinatarioTipo, 'CLIENTE');
    assert.equal(resultado.notificacionEscaneador, null);
    assert.match(resultado.notificacionCliente.mensaje, /1 día restante/);
});

test('notificarRevisionQr notifica a ambos con motivo cuando el acceso es denegado en Android', async () => {
    const creaciones = [];

    const resultado = await notificarRevisionQr({
        cliente: {
            id: 40,
            usuarioId: 500,
            empresaId: 1,
            sucursalId: 3,
            nombre: 'Ana',
            apellidoPaterno: 'Ruiz',
        },
        acceso: false,
        mensajeDetalle: 'Membresía vencida el 10/11/2026',
        scannerUsuarioId: 90,
        empresaId: 1,
        sucursalId: 3,
        desdeAndroid: true,
        prismaClient: {
            empleado: {
                findFirst: async () => ({ id: 15, usuarioId: 90, sucursalId: 3 }),
            },
            notificacion: {
                create: async ({ data }) => {
                    const creada = { id: creaciones.length + 1, ...data };
                    creaciones.push(creada);
                    return creada;
                },
            },
        },
        enviarPush: async () => ({ enviados: 1, eliminados: 0 }),
    });

    assert.equal(creaciones.length, 2);
    assert.match(resultado.notificacionCliente.titulo, /denegada/i);
    assert.match(resultado.notificacionCliente.mensaje, /Membresía vencida el 10\/11\/2026/);
    assert.match(resultado.notificacionEscaneador.titulo, /denegado/i);
    assert.match(resultado.notificacionEscaneador.mensaje, /Ana Ruiz/);
    assert.match(resultado.notificacionEscaneador.mensaje, /Membresía vencida el 10\/11\/2026/);
});

test('notificarRevisionQr notifica al cliente si el escaneador no tiene empleado asociado', async () => {
    const creaciones = [];

    const resultado = await notificarRevisionQr({
        cliente: {
            id: 41,
            usuarioId: 501,
            empresaId: 1,
            sucursalId: 1,
            nombre: 'Luis',
            apellidoPaterno: 'Gómez',
        },
        acceso: true,
        membresia: { tipoMembresia: { nombre: 'Plan Básico' } },
        diasRestantes: 10,
        scannerUsuarioId: 999,
        empresaId: 1,
        sucursalId: 1,
        desdeAndroid: true,
        prismaClient: {
            empleado: {
                findFirst: async () => null,
            },
            notificacion: {
                create: async ({ data }) => {
                    const creada = { id: 77, ...data };
                    creaciones.push(creada);
                    return creada;
                },
            },
        },
        enviarPush: async () => ({ enviados: 1, eliminados: 0 }),
    });

    assert.equal(creaciones.length, 1);
    assert.equal(resultado.notificacionCliente.id, 77);
    assert.equal(resultado.notificacionCliente.remitenteId, null);
    assert.equal(resultado.notificacionEscaneador, null);
});

test('notificarRevisionQr aísla fallos de envío push sin perder al otro destinatario', async () => {
    const creaciones = [];

    const resultado = await notificarRevisionQr({
        cliente: {
            id: 42,
            usuarioId: 502,
            empresaId: 1,
            sucursalId: 1,
            nombre: 'María',
            apellidoPaterno: 'Pérez',
        },
        acceso: true,
        membresia: { tipoMembresia: { nombre: 'VIP' } },
        diasRestantes: 5,
        scannerUsuarioId: 77,
        empresaId: 1,
        sucursalId: 1,
        desdeAndroid: true,
        prismaClient: {
            empleado: {
                findFirst: async () => ({ id: 18, usuarioId: 77, sucursalId: 1 }),
            },
            notificacion: {
                create: async ({ data }) => {
                    const creada = { id: creaciones.length + 1, ...data };
                    creaciones.push(creada);
                    return creada;
                },
            },
        },
        enviarPush: async ({ notificacion }) => {
            if (notificacion.destinatarioTipo === 'CLIENTE') {
                throw new Error('Fallo simulado de FCM');
            }
            return { enviados: 1, eliminados: 0 };
        },
    });

    assert.equal(creaciones.length, 2);
    assert.ok(resultado.notificacionCliente);
    assert.ok(resultado.notificacionEscaneador);
});

test('AsistenciaController.validarQr invoca notificarQr con desdeAndroid true/false según la plataforma', async () => {
    const llamadasNotificar = [];
    const fechaFutura = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const clienteMock = {
        id: 10,
        usuarioId: 200,
        empresaId: 1,
        sucursalId: 2,
        nombre: 'Elena',
        apellidoPaterno: 'Torres',
        codigoQr: 'APX-1234ABCD',
    };

    let membresiaMock = {
        id: 55,
        fechaFin: fechaFutura,
        tipoMembresia: { nombre: 'Plan Anual' },
    };
    let historialMock = [];

    const controller = new AsistenciaController({
        dao: {},
        clientes: {
            getByCodigoQr: async () => clienteMock,
        },
        membresias: {
            getActivaPorCliente: async () => membresiaMock,
            getHistorialPorCliente: async () => historialMock,
        },
        notificarQr: async (params) => {
            llamadasNotificar.push(params);
            return { notificacionCliente: { id: 1 }, notificacionEscaneador: null };
        },
    });

    const resAndroid = crearRespuesta();
    await controller.validarQr({
        body: { qr: 'APX-1234ABCD', plataforma: 'ANDROID' },
        headers: { 'x-plataforma': 'ANDROID' },
        usuario: { id: 88, empresaId: 1, sucursalId: 2 },
    }, resAndroid);

    assert.equal(resAndroid.statusCode, 200);
    assert.equal(resAndroid.body.data.acceso, true);
    assert.equal(llamadasNotificar.length, 1);
    assert.equal(llamadasNotificar[0].desdeAndroid, true);
    assert.equal(llamadasNotificar[0].acceso, true);
    assert.equal(llamadasNotificar[0].scannerUsuarioId, 88);

    membresiaMock = null;
    historialMock = [{ id: 54, fechaFin: '2026-10-01T00:00:00.000Z' }];

    const resWeb = crearRespuesta();
    await controller.validarQr({
        body: { qr: 'APX-1234ABCD' },
        headers: {},
        usuario: { id: 91, empresaId: 1, sucursalId: 2 },
    }, resWeb);

    assert.equal(resWeb.statusCode, 200);
    assert.equal(resWeb.body.data.acceso, false);
    assert.equal(llamadasNotificar.length, 2);
    assert.equal(llamadasNotificar[1].desdeAndroid, false);
    assert.equal(llamadasNotificar[1].acceso, false);
    assert.equal(llamadasNotificar[1].scannerUsuarioId, 91);
});
