import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../../dao/BaseDao.js';
import { PedidoCompraDao } from '../../dao/PedidoCompraDao.js';
import { PedidoCompraController } from '../../controller/PedidoCompraController.js';

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

test('crearPedido consolida productos duplicados y calcula costo estimado desde BD y overrides', async () => {
    let datosCreados = null;
    const prismaMock = {
        $transaction: async (fn) => fn({
            producto: {
                findMany: async () => [
                    { id: 10, nombre: 'Proteína', precioCompra: 500 },
                    { id: 20, nombre: 'Creatina', precioCompra: 250 },
                ],
            },
            pedidoCompra: {
                create: async ({ data }) => {
                    datosCreados = data;
                    return { id: 1, ...data, detalles: data.detalles.create };
                },
            },
        }),
    };

    const dao = new PedidoCompraDao({ prismaClient: prismaMock });
    const pedido = await dao.crearPedido({
        empresaId: 1,
        sucursalId: 2,
        solicitanteEmpleadoId: 7,
        proveedor: 'Suplementos MX',
        observaciones: 'Urgente',
        detalles: [
            { productoId: 10, cantidad: 2 },
            { productoId: 10, cantidad: 3 },
            { productoId: 20, cantidad: 4, costoUnitario: 275.5 },
        ],
    });

    assert.equal(pedido.id, 1);
    assert.equal(datosCreados.estado, 'PENDIENTE');
    assert.equal(datosCreados.sucursalId, 2);
    assert.equal(datosCreados.solicitanteEmpleadoId, 7);
    assert.equal(datosCreados.detalles.create.length, 2);
    assert.deepEqual(datosCreados.detalles.create[0], {
        productoId: 10,
        cantidad: 5,
        costoUnitario: 500,
        subtotal: 2500,
    });
    assert.deepEqual(datosCreados.detalles.create[1], {
        productoId: 20,
        cantidad: 4,
        costoUnitario: 275.5,
        subtotal: 1102,
    });
    assert.equal(datosCreados.totalEstimado, 3602);
});

test('aprobarPedido cambia estado a APROBADO e incrementa el stockActual de cada producto', async () => {
    const incrementos = [];
    let updateEstadoWhere = null;
    let updateEstadoData = null;

    const prismaMock = {
        $transaction: async (fn) => fn({
            pedidoCompra: {
                updateMany: async ({ where, data }) => {
                    updateEstadoWhere = where;
                    updateEstadoData = data;
                    return { count: 1 };
                },
                findFirst: async ({ include }) => {
                    if (!include) {
                        return {
                            id: 15,
                            detalles: [
                                { productoId: 10, cantidad: 6 },
                                { productoId: 20, cantidad: 12 },
                            ],
                        };
                    }
                    return {
                        id: 15,
                        estado: 'APROBADO',
                        validadorEmpleadoId: 9,
                        detalles: [
                            { productoId: 10, cantidad: 6 },
                            { productoId: 20, cantidad: 12 },
                        ],
                    };
                },
            },
            producto: {
                updateMany: async ({ where, data }) => {
                    incrementos.push({ productoId: where.id, increment: data.stockActual.increment });
                    return { count: 1 };
                },
            },
        }),
    };

    const dao = new PedidoCompraDao({ prismaClient: prismaMock });
    const resultado = await dao.aprobarPedido({
        id: 15,
        empresaId: 1,
        sucursalId: 2,
        validadorEmpleadoId: 9,
    });

    assert.equal(updateEstadoWhere.estado, 'PENDIENTE');
    assert.equal(updateEstadoData.estado, 'APROBADO');
    assert.equal(updateEstadoData.validadorEmpleadoId, 9);
    assert.deepEqual(incrementos, [
        { productoId: 10, increment: 6 },
        { productoId: 20, increment: 12 },
    ]);
    assert.equal(resultado.estado, 'APROBADO');
});

test('aprobarPedido rechaza con 409 si el pedido ya fue procesado y no modifica stock', async () => {
    let productoActualizado = false;
    const prismaMock = {
        $transaction: async (fn) => fn({
            pedidoCompra: {
                updateMany: async () => ({ count: 0 }),
                findFirst: async () => ({ id: 15, estado: 'APROBADO' }),
            },
            producto: {
                updateMany: async () => {
                    productoActualizado = true;
                    return { count: 1 };
                },
            },
        }),
    };

    const dao = new PedidoCompraDao({ prismaClient: prismaMock });
    await assert.rejects(
        () => dao.aprobarPedido({ id: 15, empresaId: 1, sucursalId: 1, validadorEmpleadoId: 9 }),
        (error) => error.status === 409 && /ya fue procesado/i.test(error.message)
    );
    assert.equal(productoActualizado, false);
});

test('rechazarPedido marca estado RECHAZADO con motivo y nunca modifica el stock', async () => {
    let productoTocado = false;
    let dataRechazo = null;
    const prismaMock = {
        $transaction: async (fn) => fn({
            pedidoCompra: {
                updateMany: async ({ data }) => {
                    dataRechazo = data;
                    return { count: 1 };
                },
                findFirst: async () => ({
                    id: 22,
                    estado: 'RECHAZADO',
                    motivoRechazo: 'Proveedor sin stock',
                }),
            },
            producto: {
                updateMany: async () => {
                    productoTocado = true;
                    return { count: 1 };
                },
            },
        }),
    };

    const dao = new PedidoCompraDao({ prismaClient: prismaMock });
    const resultado = await dao.rechazarPedido({
        id: 22,
        empresaId: 1,
        sucursalId: 1,
        validadorEmpleadoId: 4,
        motivoRechazo: '  Proveedor sin stock  ',
    });

    assert.equal(dataRechazo.estado, 'RECHAZADO');
    assert.equal(dataRechazo.motivoRechazo, 'Proveedor sin stock');
    assert.equal(productoTocado, false);
    assert.equal(resultado.estado, 'RECHAZADO');
});

test('PedidoCompraController valida detalles vacíos, exige empleado y notifica al aprobar', async () => {
    const notificacionesCreadas = [];
    const pushEnviados = [];

    const controllerSinEmpleado = new PedidoCompraController({
        dao: {},
        prismaClient: {
            empleado: { findFirst: async () => null },
        },
        enviarPush: async () => ({ enviados: 0, eliminados: 0 }),
    });

    const res403 = crearRespuesta();
    await controllerSinEmpleado.crear({
        usuario: { id: 50, empresaId: 1, sucursalId: 1 },
        headers: {},
        body: { detalles: [{ productoId: 1, cantidad: 2 }] },
    }, res403);
    assert.equal(res403.statusCode, 403);

    const controller = new PedidoCompraController({
        dao: {
            aprobarPedido: async () => ({
                id: 30,
                empresaId: 1,
                sucursalId: 2,
                estado: 'APROBADO',
                solicitanteEmpleado: { id: 12, usuarioId: 300 },
            }),
        },
        prismaClient: {
            empleado: { findFirst: async () => ({ id: 8, usuarioId: 100, sucursalId: 2 }) },
            notificacion: {
                create: async ({ data }) => {
                    const creada = { id: 90, ...data };
                    notificacionesCreadas.push(creada);
                    return creada;
                },
            },
        },
        enviarPush: async (args) => {
            pushEnviados.push(args);
            return { enviados: 1, eliminados: 0 };
        },
    });

    const res400 = crearRespuesta();
    await controller.crear({
        usuario: { id: 100, empresaId: 1, sucursalId: 2 },
        headers: {},
        body: { detalles: [] },
    }, res400);
    assert.equal(res400.statusCode, 400);

    const res200 = crearRespuesta();
    await controller.aprobar({
        params: { id: '30' },
        usuario: { id: 100, empresaId: 1, sucursalId: 2 },
        headers: { 'x-sucursal-id': '2' },
        body: {},
    }, res200);
    assert.equal(res200.statusCode, 200);
    assert.equal(notificacionesCreadas.length, 1);
    assert.equal(notificacionesCreadas[0].destinatarioId, 12);
    assert.equal(notificacionesCreadas[0].tipo, 'PEDIDO_COMPRA');
    assert.equal(pushEnviados.length, 1);
    assert.equal(pushEnviados[0].destinatarioUsuarioId, 300);
});
