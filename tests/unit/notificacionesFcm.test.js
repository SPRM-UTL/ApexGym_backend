import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { getApps } from 'firebase-admin/app';
import { pool } from '../../dao/BaseDao.js';
import { DispositivoController } from '../../controller/DispositivoController.js';
import { firebaseMessaging } from '../../services/firebaseAdmin.js';
import { enviarPushNotificacion } from '../../services/notificacionesPush.js';

after(() => pool.end());

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

test('registra o actualiza el token para el empleado autenticado', async () => {
    let upsertArgs;
    const controller = new DispositivoController({
        cliente: { findFirst: async () => null },
        empleado: { findFirst: async () => ({ id: 23 }) },
        dispositivo: {
            upsert: async (args) => {
                upsertArgs = args;
                return { id: 7, tipo: 'EMPLEADO', plataforma: 'ANDROID', updatedAt: new Date() };
            },
        },
    });
    const res = crearRespuesta();

    await controller.registrarToken({
        usuario: { id: 12, empresaId: 4 },
        body: { token: 'test-fcm-device-token', plataforma: 'android' },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.responseFlag, 0);
    assert.deepEqual(upsertArgs.where, { token: 'test-fcm-device-token' });
    assert.deepEqual(upsertArgs.create, {
        empresaId: 4,
        usuarioId: 12,
        tipo: 'EMPLEADO',
        token: 'test-fcm-device-token',
        plataforma: 'ANDROID',
    });
    assert.deepEqual(upsertArgs.update, {
        empresaId: 4,
        usuarioId: 12,
        tipo: 'EMPLEADO',
        plataforma: 'ANDROID',
    });
});

test('registra el token como CLIENTE según la cuenta autenticada', async () => {
    let upsertArgs;
    const controller = new DispositivoController({
        cliente: { findFirst: async () => ({ id: 6 }) },
        empleado: { findFirst: async () => { throw new Error('No debe consultar empleado'); } },
        dispositivo: {
            upsert: async (args) => {
                upsertArgs = args;
                return { id: 8, tipo: 'CLIENTE', plataforma: 'ANDROID', updatedAt: new Date() };
            },
        },
    });
    const res = crearRespuesta();

    await controller.registrarToken({
        usuario: { id: 13, empresaId: 4 },
        body: { token: 'test-fcm-client-token', plataforma: 'ANDROID' },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(upsertArgs.create.tipo, 'CLIENTE');
    assert.equal(upsertArgs.create.usuarioId, 13);
});

test('rechaza registrar token para cuentas sin cliente o empleado activo', async () => {
    const controller = new DispositivoController({
        cliente: { findFirst: async () => null },
        empleado: { findFirst: async () => null },
        dispositivo: { upsert: async () => { throw new Error('No debe registrar'); } },
    });
    const res = crearRespuesta();

    await controller.registrarToken({
        usuario: { id: 14, empresaId: 4 },
        body: { token: 'test-fcm-orphan-token', plataforma: 'ANDROID' },
    }, res);

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.responseFlag, 1);
});

test('envía push y elimina solo tokens que Firebase reporta como inválidos', async () => {
    const llamadasEnvio = [];
    const llamadasBorrado = [];
    const resultado = await enviarPushNotificacion({
        notificacion: {
            id: 91,
            empresaId: 4,
            destinatarioTipo: 'CLIENTE',
            titulo: 'Aviso de prueba',
            mensaje: 'Mensaje de prueba',
            tipo: 'GENERAL',
        },
        destinatarioUsuarioId: 12,
        prismaClient: {
            dispositivo: {
                findMany: async (args) => {
                    assert.deepEqual(args.where, { empresaId: 4, usuarioId: 12, tipo: 'CLIENTE' });
                    return [
                        { token: 'test-fcm-valid-token' },
                        { token: 'test-fcm-invalid-token' },
                        { token: 'test-fcm-temporary-error-token' },
                    ];
                },
                deleteMany: async (args) => {
                    llamadasBorrado.push(args);
                    return { count: args.where.token.in.length };
                },
            },
        },
        messaging: {
            sendEachForMulticast: async (payload) => {
                llamadasEnvio.push(payload);
                return {
                    successCount: 1,
                    responses: [
                        { success: true },
                        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
                        { success: false, error: { code: 'messaging/internal-error' } },
                    ],
                };
            },
        },
    });

    assert.equal(llamadasEnvio.length, 1);
    assert.deepEqual(llamadasEnvio[0].notification, { title: 'Aviso de prueba', body: 'Mensaje de prueba' });
    assert.deepEqual(llamadasEnvio[0].data, { notificacionId: '91', tipo: 'GENERAL' });
    assert.deepEqual(llamadasBorrado, [{ where: { token: { in: ['test-fcm-invalid-token'] } } }]);
    assert.deepEqual(resultado, { enviados: 1, eliminados: 1 });
});

test('no intenta enviar si no hay tokens registrados o SDK disponible', async () => {
    let consultado = false;
    const resultado = await enviarPushNotificacion({
        notificacion: { id: 1, empresaId: 1, destinatarioTipo: 'CLIENTE' },
        destinatarioUsuarioId: 2,
        prismaClient: {
            dispositivo: { findMany: async () => { consultado = true; return []; } },
        },
        messaging: null,
    });

    assert.equal(consultado, false);
    assert.deepEqual(resultado, { enviados: 0, eliminados: 0 });
});

test('Firebase Admin reutiliza una sola app predeterminada cuando hay credenciales', {
    skip: !firebaseMessaging,
}, () => {
    assert.equal(getApps().filter((app) => app.name === '[DEFAULT]').length, 1);
});
