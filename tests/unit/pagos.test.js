import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { pool } from '../../dao/BaseDao.js';
import {
    PagoService,
    resolverCobroPresencial,
    verificarFirmaMercadoPago,
} from '../../services/PagoService.js';
import { VentaController } from '../../controller/VentaController.js';

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

test('resolverCobroPresencial valida efectivo, tarjeta, transferencia y rechaza inválidos', () => {
    const efectivoOk = resolverCobroPresencial({
        proveedor: 'EFECTIVO',
        monto: 150,
        efectivoRecibido: 200,
        exigirDatosCompletos: true,
    });
    assert.equal(efectivoOk.estado, 'APROBADO');
    assert.match(efectivoOk.referenciaExterna, /^EFECTIVO_/);

    assert.throws(
        () => resolverCobroPresencial({
            proveedor: 'EFECTIVO',
            monto: 150,
            efectivoRecibido: 100,
            exigirDatosCompletos: true,
        }),
        /Efectivo insuficiente/i
    );

    assert.throws(
        () => resolverCobroPresencial({
            proveedor: 'EFECTIVO',
            monto: 150,
            efectivoRecibido: null,
            exigirDatosCompletos: true,
        }),
        /monto recibido válido/i
    );

    const tarjetaOk = resolverCobroPresencial({
        proveedor: 'TERMINAL_MANUAL',
        monto: 300,
        folioVoucher: 'AUTH-9981',
        tipoTarjeta: 'debito',
        marcaTarjeta: 'visa',
        ultimosDigitos: '4242',
        exigirDatosCompletos: true,
    });
    assert.equal(tarjetaOk.estado, 'APROBADO');
    assert.equal(tarjetaOk.referenciaExterna, 'TERM_MANUAL_AUTH-9981');

    assert.throws(
        () => resolverCobroPresencial({
            proveedor: 'TERMINAL_MANUAL',
            monto: 300,
            ultimosDigitos: '42',
            exigirDatosCompletos: true,
        }),
        /cuatro números/i
    );

    const transferenciaOk = resolverCobroPresencial({
        proveedor: 'TRANSFERENCIA',
        monto: 499,
        referenciaTransferencia: 'SPEI-12345',
    });
    assert.equal(transferenciaOk.estado, 'PENDIENTE');
    assert.equal(transferenciaOk.referenciaExterna, 'TRANSFERENCIA_SPEI-12345');

    assert.throws(
        () => resolverCobroPresencial({ proveedor: 'MERCADO_PAGO', monto: 100 }),
        /no corresponde a un método de pago presencial/i
    );
});

test('verificarFirmaMercadoPago valida firma HMAC SHA-256 y rechaza alteraciones', () => {
    const secreto = 'secreto_webhook_test';
    const paymentId = '987654321';
    const requestId = 'req-abc-123';
    const ts = '1700000000';
    const manifiesto = `id:${paymentId};request-id:${requestId};ts:${ts};`;
    const v1 = crypto.createHmac('sha256', secreto).update(manifiesto).digest('hex');

    assert.equal(
        verificarFirmaMercadoPago({
            firma: `ts=${ts},v1=${v1}`,
            requestId,
            paymentId,
            secreto,
        }),
        true
    );

    assert.equal(
        verificarFirmaMercadoPago({
            firma: `ts=${ts},v1=${'0'.repeat(64)}`,
            requestId,
            paymentId,
            secreto,
        }),
        false
    );
});

test('PagoService.registrarCobroVenta conserva uuidIdempotencia explícito y detecta voucher duplicado', async () => {
    const service = new PagoService({ env: { MP_ACCESS_TOKEN: 'TEST-1234' } });
    let dataCreada = null;
    const movimientos = [];

    const tx = {
        transaccionPago: {
            findFirst: async () => null,
            create: async ({ data }) => {
                dataCreada = data;
                return { id: 55, ...data };
            },
        },
        movimientoCaja: {
            findFirst: async () => null,
            create: async ({ data }) => {
                movimientos.push(data);
                return { id: 77, ...data };
            },
        },
    };

    const transaccion = await service.registrarCobroVenta(tx, {
        empresaId: 1,
        sucursalId: 1,
        ventaId: 10,
        aperturaCajaId: 3,
        empleadoId: 2,
        folioVenta: 1010,
        proveedor: 'EFECTIVO',
        monto: 116,
        uuidIdempotencia: 'offline-uuid-001',
        efectivoRecibido: 150,
        cambio: 34,
    });

    assert.equal(transaccion.id, 55);
    assert.equal(dataCreada.uuidIdempotencia, 'offline-uuid-001');
    assert.equal(dataCreada.estado, 'APROBADO');
    assert.equal(movimientos.length, 1);
    assert.equal(movimientos[0].afectaEfectivo, true);

    const txVoucherDup = {
        transaccionPago: {
            findFirst: async () => ({ id: 88 }),
        },
    };
    await assert.rejects(
        () => service.registrarCobroVenta(txVoucherDup, {
            empresaId: 1,
            sucursalId: 1,
            ventaId: 11,
            aperturaCajaId: 3,
            empleadoId: 2,
            folioVenta: 1011,
            proveedor: 'TERMINAL_MANUAL',
            monto: 200,
            folioVoucher: 'DUP-01',
        }),
        (err) => err.status === 409 && /DUP-01/.test(err.message)
    );
});

test('VentaController.sincronizarOffline exige efectivo, deduplica uuidIdempotencia y crea nuevas ventas', async () => {
    const ventasCreadas = [];
    const uuidsExistentes = new Set(['uuid-ya-sincronizada']);

    const daoMock = {
        prisma: {
            metodoPago: {
                findFirst: async ({ where }) => {
                    if (where?.codigo === 'EFECTIVO' || where?.id === 1) {
                        return { id: 1, codigo: 'EFECTIVO' };
                    }
                    if (where?.id === 2) {
                        return { id: 2, codigo: 'TARJETA' };
                    }
                    return null;
                },
            },
            transaccionPago: {
                findUnique: async ({ where }) => {
                    if (uuidsExistentes.has(where?.uuidIdempotencia)) {
                        return { id: 900, ventaId: 50 };
                    }
                    return null;
                },
            },
            cliente: {
                findFirst: async () => ({ id: 4 }),
            },
            aperturaCaja: {
                findFirst: async () => ({ id: 8, empleadoId: 3 }),
            },
        },
        create: async (payload) => {
            ventasCreadas.push(payload);
            return { id: 100 + ventasCreadas.length, total: payload.total };
        },
    };

    const controller = new VentaController(daoMock);

    // Lote vacío -> 400
    const resVacio = crearRespuesta();
    await controller.sincronizarOffline({
        headers: {},
        query: {},
        usuario: { id: 1, empresaId: 1, sucursalId: 1 },
        body: { ventas: [] },
    }, resVacio);
    assert.equal(resVacio.statusCode, 400);

    // Lote mixto: 1 válida efectivo, 1 tarjeta rechazada, 1 duplicada en BD, 1 duplicada en mismo lote
    const res = crearRespuesta();
    await controller.sincronizarOffline({
        headers: { 'x-sucursal-id': '1' },
        query: {},
        usuario: { id: 1, empresaId: 1, sucursalId: 1 },
        body: {
            ventas: [
                {
                    uuidIdempotencia: 'uuid-nueva-001',
                    folioLocal: 'OFF-20261120-0001',
                    empleadoId: 3,
                    aperturaCajaId: 8,
                    clienteId: 4,
                    metodoPagoId: 1,
                    metodoPagoCodigo: 'EFECTIVO',
                    subtotal: 100,
                    total: 116,
                    montoRecibido: 150,
                    detalleVenta: [{ tipoItem: 'PRODUCTO', productoId: 5, cantidad: 1 }],
                },
                {
                    uuidIdempotencia: 'uuid-tarjeta-rechazada',
                    folioLocal: 'OFF-20261120-0002',
                    empleadoId: 3,
                    aperturaCajaId: 8,
                    clienteId: 4,
                    metodoPagoId: 2,
                    metodoPagoCodigo: 'TARJETA',
                    subtotal: 100,
                    total: 116,
                    detalleVenta: [{ tipoItem: 'PRODUCTO', productoId: 5, cantidad: 1 }],
                },
                {
                    uuidIdempotencia: 'uuid-ya-sincronizada',
                    folioLocal: 'OFF-20261120-0003',
                    empleadoId: 3,
                    aperturaCajaId: 8,
                    clienteId: 4,
                    metodoPagoId: 1,
                    metodoPagoCodigo: 'EFECTIVO',
                    subtotal: 100,
                    total: 116,
                    detalleVenta: [{ tipoItem: 'PRODUCTO', productoId: 5, cantidad: 1 }],
                },
                {
                    uuidIdempotencia: 'uuid-nueva-001',
                    folioLocal: 'OFF-20261120-0001',
                    empleadoId: 3,
                    aperturaCajaId: 8,
                    clienteId: 4,
                    metodoPagoId: 1,
                    metodoPagoCodigo: 'EFECTIVO',
                    subtotal: 100,
                    total: 116,
                    detalleVenta: [{ tipoItem: 'PRODUCTO', productoId: 5, cantidad: 1 }],
                },
            ],
        },
    }, res);

    assert.equal(res.statusCode, 200);
    const data = res.body.data;
    assert.equal(data.sincronizadas.length, 1);
    assert.equal(data.sincronizadas[0].uuidIdempotencia, 'uuid-nueva-001');
    assert.equal(data.duplicadas.length, 2);
    assert.equal(data.errores.length, 1);
    assert.equal(data.errores[0].uuidIdempotencia, 'uuid-tarjeta-rechazada');
    assert.equal(data.errores[0].status, 400);
    assert.equal(data.errores[0].error, 'Las ventas sin conexión solo están permitidas en efectivo');
    assert.equal(ventasCreadas.length, 1);
    assert.equal(ventasCreadas[0].uuidIdempotencia, 'uuid-nueva-001');
});
