import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../../dao/BaseDao.js';
import { AlmacenDao } from '../../dao/AlmacenDao.js';
import { ReporteDao } from '../../dao/ReporteDao.js';
import { NotificacionController } from '../../controller/NotificacionController.js';
import { DispositivoController } from '../../controller/DispositivoController.js';
import {
    contarSuscriptoresSse,
    publicarEventoNotificacion,
    registrarClienteSse,
} from '../../services/notificacionesStream.js';
import {
    TIPO_NOTIFICACION_ACTIVIDAD_EMPLEADO,
    debeNotificarActividadEmpleado,
    notificarActividadEmpleado,
} from '../../services/notificacionesActividadEmpleado.js';
import { crearActividadEmpleadoMiddleware } from '../../middleware/actividadEmpleadoMiddleware.js';

after(() => pool.end());

function crearRespuestaMock() {
    const eventos = new Map();
    const writes = [];
    const headers = {};
    return {
        statusCode: 200,
        body: null,
        headers,
        writes,
        writableEnded: false,
        destroyed: false,
        setHeader(k, v) {
            headers[k] = v;
        },
        flushHeaders() {},
        write(chunk) {
            writes.push(chunk);
            return true;
        },
        on(evt, cb) {
            if (!eventos.has(evt)) eventos.set(evt, []);
            eventos.get(evt).push(cb);
        },
        emit(evt) {
            for (const cb of eventos.get(evt) ?? []) cb();
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
}

test('AlmacenDao.eliminar impide borrar único almacén principal o almacén con stock > 0', async () => {
    const daoPrincipal = new AlmacenDao({
        prismaClient: {
            $transaction: async (fn) => fn({
                almacen: {
                    findFirst: async ({ where }) => {
                        if (where.id?.not) return null;
                        return { id: 1, empresaId: 1, sucursalId: 1, esPrincipal: true };
                    },
                },
            }),
        },
    });

    await assert.rejects(
        () => daoPrincipal.eliminar(1, { empresaId: 1, sucursalId: 1 }),
        (err) => err.status === 409 && /único almacén principal/i.test(err.message)
    );

    const daoConStock = new AlmacenDao({
        prismaClient: {
            $transaction: async (fn) => fn({
                almacen: {
                    findFirst: async () => ({ id: 2, empresaId: 1, sucursalId: 1, esPrincipal: false }),
                },
                inventarioAlmacen: {
                    findFirst: async () => ({ id: 10, stockActual: 5 }),
                },
            }),
        },
    });

    await assert.rejects(
        () => daoConStock.eliminar(2, { empresaId: 1, sucursalId: 1 }),
        (err) => err.status === 409 && /existencias mayores a 0/i.test(err.message)
    );
});

test('AlmacenDao.obtenerInventario devuelve 0 para productos sin fila y ajustarStock recalcula stockGlobal', async () => {
    let stockGlobalActualizado = null;
    const dao = new AlmacenDao({
        prismaClient: {
            almacen: {
                findFirst: async () => ({
                    id: 2,
                    empresaId: 1,
                    sucursalId: 1,
                    nombre: 'Bodega General',
                    esPrincipal: false,
                    activo: true,
                }),
            },
            producto: {
                findMany: async () => [
                    {
                        id: 1,
                        nombre: 'Agua 600ml',
                        codigoBarras: '7501',
                        categoriaProductoId: 2,
                        categoria: { id: 2, nombre: 'Bebidas' },
                        precioVenta: 20,
                        precioCompra: 8,
                        stockActual: 15,
                        stockMinimo: 5,
                        estado: 'ACTIVO',
                        disponibleCompra: true,
                        imagenUrl: null,
                        inventariosAlmacen: [],
                    },
                ],
            },
            $transaction: async (fn) => fn({
                almacen: {
                    findFirst: async () => ({ id: 2, empresaId: 1, sucursalId: 1, nombre: 'Bodega General', activo: true }),
                },
                producto: {
                    findFirst: async () => ({ id: 1, nombre: 'Agua 600ml', stockMinimo: 5 }),
                    update: async ({ data }) => {
                        stockGlobalActualizado = data.stockActual;
                        return { id: 1, stockActual: data.stockActual };
                    },
                },
                inventarioAlmacen: {
                    upsert: async ({ create }) => ({ id: 99, ...create }),
                    aggregate: async () => ({ _sum: { stockActual: 22 } }),
                },
            }),
        },
    });

    const inv = await dao.obtenerInventario(2, 1, 1);
    assert.equal(inv.productos.length, 1);
    assert.equal(inv.productos[0].stockActual, 0);
    assert.equal(inv.productos[0].stockGlobal, 15);

    const ajuste = await dao.ajustarStock({
        almacenId: 2,
        productoId: 1,
        empresaId: 1,
        sucursalId: 1,
        stockActual: 7,
        stockMinimo: 2,
        ubicacionEstante: 'B-04',
    });
    assert.equal(stockGlobalActualizado, 22);
    assert.equal(ajuste.stockGlobal, 22);
});

test('AlmacenDao.transferirStock valida stock en origen, misma sucursal y mantiene consistencia', async () => {
    const daoStockInsuficiente = new AlmacenDao({
        prismaClient: {
            $transaction: async (fn) => fn({
                almacen: {
                    findFirst: async ({ where }) => ({
                        id: where.id,
                        empresaId: 1,
                        sucursalId: 1,
                        nombre: where.id === 1 ? 'Principal' : 'Bodega',
                        activo: true,
                    }),
                },
                producto: {
                    findFirst: async () => ({ id: 10, nombre: 'Proteína', stockMinimo: 2 }),
                },
                inventarioAlmacen: {
                    updateMany: async () => ({ count: 0 }),
                    findFirst: async () => ({ stockActual: 1 }),
                },
            }),
        },
    });

    await assert.rejects(
        () => daoStockInsuficiente.transferirStock({
            origenAlmacenId: 1,
            destinoAlmacenId: 2,
            productoId: 10,
            cantidad: 5,
            empresaId: 1,
            sucursalId: 1,
        }),
        (err) => err.status === 409 && /Stock insuficiente/i.test(err.message)
    );

    let origenStock = 10;
    let destinoStock = 2;
    const daoOk = new AlmacenDao({
        prismaClient: {
            $transaction: async (fn) => fn({
                almacen: {
                    findFirst: async ({ where }) => ({
                        id: where.id,
                        empresaId: 1,
                        sucursalId: 1,
                        nombre: where.id === 1 ? 'Principal' : 'Bodega',
                        activo: true,
                    }),
                },
                producto: {
                    findFirst: async () => ({ id: 10, nombre: 'Proteína', stockMinimo: 2 }),
                    update: async ({ data }) => ({ id: 10, stockActual: data.stockActual }),
                },
                inventarioAlmacen: {
                    updateMany: async ({ data }) => {
                        origenStock -= data.stockActual.decrement;
                        return { count: 1 };
                    },
                    upsert: async ({ update }) => {
                        destinoStock += update.stockActual.increment;
                        return { almacenId: 2, productoId: 10, stockActual: destinoStock };
                    },
                    findFirst: async () => ({ stockActual: origenStock }),
                    aggregate: async () => ({ _sum: { stockActual: origenStock + destinoStock } }),
                },
            }),
        },
    });

    const transferencia = await daoOk.transferirStock({
        origenAlmacenId: 1,
        destinoAlmacenId: 2,
        productoId: 10,
        cantidad: 4,
        empresaId: 1,
        sucursalId: 1,
    });
    assert.equal(transferencia.origen.stockActual, 6);
    assert.equal(transferencia.destino.stockActual, 6);
    assert.equal(transferencia.stockGlobal, 12);
});

test('ReporteDao construye estructuras exactas de ventas, rendimiento y top-productos', async () => {
    const fechaVenta = new Date('2026-11-20T15:00:00-06:00');
    const dao = new ReporteDao({
        prismaClient: {
            almacen: { findFirst: async () => ({ id: 1 }) },
            venta: {
                findMany: async () => [
                    {
                        id: 1,
                        empleadoId: 5,
                        total: 500,
                        estado: 'completada',
                        createdAt: fechaVenta,
                        cliente: { id: 1, nombre: 'Carlos', apellidoPaterno: 'Ramírez', apellidoMaterno: null },
                        empleado: {
                            id: 5,
                            nombre: 'Ana',
                            apellidoPaterno: 'López',
                            apellidoMaterno: null,
                            puesto: { nombre: 'Cajero' },
                        },
                        metodoPago: { id: 1, nombre: 'Efectivo', codigo: 'EFECTIVO' },
                        folioVenta: { id: 1001 },
                    },
                    {
                        id: 2,
                        empleadoId: 5,
                        total: 100,
                        estado: 'cancelada',
                        createdAt: fechaVenta,
                        cliente: { id: 2, nombre: 'Sofía', apellidoPaterno: 'Delgado', apellidoMaterno: null },
                        empleado: {
                            id: 5,
                            nombre: 'Ana',
                            apellidoPaterno: 'López',
                            apellidoMaterno: null,
                            puesto: { nombre: 'Cajero' },
                        },
                        metodoPago: { id: 1, nombre: 'Efectivo', codigo: 'EFECTIVO' },
                        folioVenta: { id: 1002 },
                    },
                ],
            },
            devolucion: {
                findMany: async () => [{ id: 1, monto: 50 }],
            },
            asistencia: {
                findMany: async () => [{ id: 1, fechaHora: fechaVenta }],
            },
            visita: {
                findMany: async () => [{ id: 1, fechaHora: fechaVenta, costo: 80 }],
            },
            clienteMembresia: {
                findMany: async () => [
                    { id: 1, fechaFin: new Date('2026-11-23T00:00:00Z'), estadoMembresia: { nombre: 'Vigente' } },
                    { id: 2, fechaFin: new Date('2026-10-01T00:00:00Z'), estadoMembresia: { nombre: 'Vencida' } },
                ],
            },
            cliente: { count: async () => 12 },
            aperturaCaja: { count: async () => 1 },
            corteCaja: { findMany: async () => [{ id: 1, diferencia: 0 }] },
            detalleVenta: {
                findMany: async () => [
                    {
                        productoId: 7,
                        cantidad: 3,
                        subtotal: 270,
                        producto: {
                            id: 7,
                            nombre: 'Proteína',
                            codigoBarras: '7501',
                            stockActual: 10,
                            stockMinimo: 2,
                            categoria: { nombre: 'Suplementos' },
                            inventariosAlmacen: [
                                { almacenId: 1, stockActual: 8, stockMinimo: 2, almacen: { id: 1, nombre: 'Principal', esPrincipal: true } },
                                { almacenId: 2, stockActual: 2, stockMinimo: 0, almacen: { id: 2, nombre: 'Bodega', esPrincipal: false } },
                            ],
                        },
                    },
                ],
            },
            producto: {
                findMany: async () => [
                    { id: 7, stockActual: 10, stockMinimo: 2, precioCompra: 50, precioVenta: 90 },
                    { id: 8, stockActual: 0, stockMinimo: 2, precioCompra: 20, precioVenta: 40 },
                ],
            },
        },
    });

    await assert.rejects(
        () => dao.resolverFiltros({ fechaInicio: '2026-11-20', fechaFin: '2026-11-01' }),
        (err) => err.status === 400
    );

    const resumen = await dao.obtenerResumenCompleto({
        fechaInicio: '2026-11-19',
        fechaFin: '2026-11-20',
        empresaId: 1,
        sucursalId: 1,
    });

    assert.equal(resumen.ventas.kpis.ingresosTotales, 500);
    assert.equal(resumen.ventas.kpis.totalVentas, 1);
    assert.equal(resumen.ventas.kpis.cancelaciones.cantidad, 1);
    assert.equal(resumen.ventas.kpis.devoluciones.monto, 50);
    assert.equal(resumen.ventas.serieDiaria.length, 2);
    assert.equal(resumen.ventas.porMetodoPago[0].codigo, 'EFECTIVO');
    assert.equal(resumen.ventas.ultimasVentas.length, 2);

    assert.equal(resumen.rendimiento.asistencias.totalAsistencias, 1);
    assert.equal(resumen.rendimiento.asistencias.totalVisitas, 1);
    assert.equal(resumen.rendimiento.asistencias.ingresosVisitas, 80);
    assert.equal(resumen.rendimiento.caja.cortesCuadrados, 1);
    assert.equal(resumen.rendimiento.membresias.clientesActivos, 12);

    assert.equal(resumen.topProductos.top[0].ranking, 1);
    assert.equal(resumen.topProductos.top[0].stockPorAlmacen.length, 2);
    assert.equal(resumen.topProductos.resumenStock.totalProductos, 2);
    assert.equal(resumen.topProductos.resumenStock.agotados, 1);
});

test('SSE stream, soporte USUARIO en NotificacionController/DispositivoController y middleware actividad Android', async () => {
    const resSse = crearRespuestaMock();
    const limpiar = registrarClienteSse(99, resSse, resSse);
    assert.equal(resSse.headers['Content-Type'], 'text/event-stream; charset=utf-8');
    assert.equal(contarSuscriptoresSse(99), 1);

    const enviados = publicarEventoNotificacion(99, { tipo: 'NUEVA_NOTIFICACION', notificacion: { id: 1 } });
    assert.equal(enviados, 1);
    assert.ok(resSse.writes.some((w) => w.includes('event: notificacion')));

    limpiar();
    assert.equal(contarSuscriptoresSse(99), 0);

    // DispositivoController con rol administrativo (USUARIO)
    let tipoRegistrado = null;
    const dispController = new DispositivoController({
        cliente: { findFirst: async () => null },
        empleado: { findFirst: async () => null },
        usuarioRol: { findFirst: async () => ({ rol: { nombre: 'Administrador' } }) },
        dispositivo: {
            upsert: async ({ create }) => {
                tipoRegistrado = create.tipo;
                return { id: 1, ...create, updatedAt: new Date() };
            },
        },
    });
    const resDisp = crearRespuestaMock();
    await dispController.registrarToken({
        usuario: { id: 7, empresaId: 1 },
        body: { token: 'web-admin-token-123', plataforma: 'web' },
    }, resDisp);
    assert.equal(resDisp.statusCode, 200);
    assert.equal(tipoRegistrado, 'USUARIO');

    // NotificacionController con cuenta admin (USUARIO) y marcarTodasLeidas
    const notifController = new NotificacionController({
        prismaClient: {
            cliente: { findFirst: async () => null },
            empleado: { findFirst: async () => null },
            usuarioRol: { findFirst: async () => ({ rol: { nombre: 'Administrador' } }) },
            notificacion: {
                updateMany: async ({ where }) => {
                    assert.equal(where.destinatarioTipo, 'USUARIO');
                    assert.equal(where.destinatarioId, 7);
                    return { count: 3 };
                },
            },
        },
    });
    const resTodas = crearRespuestaMock();
    await notifController.marcarTodasLeidas({ usuario: { id: 7, empresaId: 1 } }, resTodas);
    assert.equal(resTodas.statusCode, 200);
    assert.equal(resTodas.body.data.actualizadas, 3);

    // Filtro y exclusiones de actividad Android
    assert.equal(debeNotificarActividadEmpleado({
        method: 'POST',
        path: '/api/ventas',
        statusCode: 200,
        headers: { 'x-plataforma': 'ANDROID' },
        usuario: { id: 3, esCliente: false },
    }), true);

    for (const rutaExcluida of [
        '/api/usuarios/verificarCredenciales',
        '/api/usuarios/login-movil',
        '/api/usuarios/logout',
        '/api/dispositivos/token',
        '/api/notificaciones/1/leida',
        '/api/asistencias/validar-qr',
        '/api/pedidos-compra/4/aprobar',
        '/api/pedidos-compra/4/rechazar',
    ]) {
        assert.equal(debeNotificarActividadEmpleado({
            method: 'POST',
            path: rutaExcluida,
            statusCode: 200,
            headers: { 'x-plataforma': 'ANDROID' },
            usuario: { id: 3, esCliente: false },
        }), false, `Debe excluir ${rutaExcluida}`);
    }

    assert.equal(debeNotificarActividadEmpleado({
        method: 'POST',
        path: '/api/ventas',
        statusCode: 200,
        headers: { 'x-plataforma': 'ANDROID' },
        usuario: { id: 9, esCliente: true },
    }), false);

    // Middleware asíncrono sobre res.on('finish') + notificarActividadEmpleado
    const llamadasActividad = [];
    const mw = crearActividadEmpleadoMiddleware({
        notificar: async (args) => llamadasActividad.push(args),
    });
    const reqMw = {
        method: 'POST',
        originalUrl: '/api/visitas',
        headers: { 'x-plataforma': 'ANDROID', 'x-sucursal-id': '1' },
        body: {},
        usuario: { id: 3, nombre: 'Ana López', empresaId: 1, esCliente: false },
    };
    const resMw = crearRespuestaMock();
    resMw.statusCode = 201;
    let nextCalled = false;
    mw(reqMw, resMw, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    resMw.emit('finish');
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(llamadasActividad.length, 1);
    assert.equal(llamadasActividad[0].path, '/api/visitas');

    // notificarActividadEmpleado crea notificaciones para admins/supervisores y llama push
    const pushNotificados = [];
    const notifsCreadas = [];
    const resAct = await notificarActividadEmpleado({
        method: 'POST',
        path: '/api/visitas',
        usuario: { id: 3, nombre: 'Ana López', empleadoId: 1 },
        empresaId: 1,
        sucursalId: 1,
        prismaClient: {
            usuario: {
                findMany: async () => [
                    {
                        id: 1,
                        nombre: 'Admin Dev',
                        usuarioRols: [{ rol: { nombre: 'Administrador', deletedAt: null, permisos: [] } }],
                        empleados: [],
                    },
                    {
                        id: 4,
                        nombre: 'Luis Supervisor',
                        usuarioRols: [{ rol: { nombre: 'Supervisor', deletedAt: null, permisos: [] } }],
                        empleados: [{ id: 2 }],
                    },
                ],
            },
            notificacion: {
                create: async ({ data }) => {
                    const creada = { id: 500 + notifsCreadas.length, ...data };
                    notifsCreadas.push(creada);
                    return creada;
                },
            },
        },
        enviarPush: async ({ destinatarioUsuarioId, notificacion }) => {
            pushNotificados.push({ destinatarioUsuarioId, tipo: notificacion.tipo });
            return { enviados: 1, eliminados: 0 };
        },
    });

    assert.equal(resAct.creadas, 2);
    assert.equal(notifsCreadas[0].tipo, TIPO_NOTIFICACION_ACTIVIDAD_EMPLEADO);
    assert.equal(notifsCreadas[0].destinatarioTipo, 'USUARIO');
    assert.equal(notifsCreadas[1].destinatarioTipo, 'EMPLEADO');
    assert.equal(pushNotificados.length, 2);
});
