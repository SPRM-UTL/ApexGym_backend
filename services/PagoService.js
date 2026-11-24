import 'dotenv/config';
import crypto from 'crypto';
import { transaccionPagoDao } from '../dao/TransaccionPagoDao.js';

const TIPOS_TARJETA_VALIDOS = new Set(['CREDITO', 'DEBITO']);
const MARCAS_TARJETA_VALIDAS = new Set(['VISA', 'MASTERCARD', 'AMEX', 'CARNET', 'OTRA']);
export const PROVEEDOR_POR_CODIGO_METODO = Object.freeze({
    EFECTIVO: 'EFECTIVO',
    TARJETA: 'TERMINAL_MANUAL',
    TRANSFERENCIA: 'TRANSFERENCIA',
});

function crearErrorPago(mensaje, status = 400, code = null) {
    const error = new Error(mensaje);
    error.status = status;
    if (code) error.code = code;
    return error;
}

function normalizarValorTarjeta(valor) {
    return typeof valor === 'string' ? valor.trim().toUpperCase() : '';
}

export function verificarFirmaMercadoPago({ firma, requestId, paymentId, secreto }) {
    if (
        typeof firma !== 'string'
        || typeof requestId !== 'string'
        || typeof paymentId !== 'string'
        || typeof secreto !== 'string'
        || !secreto
    ) {
        return false;
    }

    const partes = Object.fromEntries(
        firma.split(',').map((parte) => {
            const [clave, ...valor] = parte.trim().split('=');
            return [clave, valor.join('=')];
        })
    );
    if (!partes.ts || !/^[a-f\d]{64}$/i.test(partes.v1 ?? '')) return false;

    const manifiesto = `id:${paymentId};request-id:${requestId};ts:${partes.ts};`;
    const esperado = crypto.createHmac('sha256', secreto).update(manifiesto).digest();
    const recibido = Buffer.from(partes.v1, 'hex');
    return recibido.length === esperado.length && crypto.timingSafeEqual(recibido, esperado);
}

export function resolverCobroPresencial({
    proveedor,
    monto,
    efectivoRecibido = null,
    folioVoucher = null,
    tipoTarjeta = null,
    marcaTarjeta = null,
    ultimosDigitos = null,
    referenciaTransferencia = null,
    exigirDatosCompletos = false,
}) {
    if (proveedor === 'EFECTIVO') {
        const recibido = efectivoRecibido === null || efectivoRecibido === undefined
            ? null
            : Number(efectivoRecibido);
        if (exigirDatosCompletos
            && (recibido === null || efectivoRecibido === '' || !Number.isFinite(recibido)
                || recibido < 0 || (monto > 0 && recibido === 0))) {
            throw crearErrorPago('Para registrar un cobro en efectivo se requiere un monto recibido válido.');
        }
        if (recibido !== null && recibido < monto) {
            throw crearErrorPago(`Efectivo insuficiente: Se entregaron $${recibido.toFixed(2)} MXN pero el monto es $${monto.toFixed(2)} MXN.`);
        }
        return {
            estado: 'APROBADO',
            referenciaExterna: `EFECTIVO_${Date.now()}`,
        };
    }

    if (proveedor === 'TERMINAL_MANUAL') {
        const voucher = typeof folioVoucher === 'string' && folioVoucher.trim() ? folioVoucher.trim() : null;
        if (voucher && voucher.length > 100) {
            throw crearErrorPago('El folio del voucher no puede exceder 100 caracteres.');
        }

        if (exigirDatosCompletos) {
            if (tipoTarjeta && !TIPOS_TARJETA_VALIDOS.has(normalizarValorTarjeta(tipoTarjeta))) {
                throw crearErrorPago('El tipo de tarjeta debe ser CREDITO o DEBITO.');
            }
            if (marcaTarjeta && !MARCAS_TARJETA_VALIDAS.has(normalizarValorTarjeta(marcaTarjeta))) {
                throw crearErrorPago('La marca de tarjeta no es válida.');
            }
            if (ultimosDigitos && !/^\d{4}$/.test(String(ultimosDigitos ?? ''))) {
                throw crearErrorPago('Los últimos dígitos de la tarjeta deben ser exactamente cuatro números.');
            }
        }

        return {
            estado: 'APROBADO',
            referenciaExterna: voucher ? `TERM_MANUAL_${voucher}` : `TARJETA_${Date.now()}`,
        };
    }

    if (proveedor === 'TRANSFERENCIA') {
        const ref = referenciaTransferencia?.trim();
        return {
            estado: 'PENDIENTE',
            referenciaExterna: ref ? `TRANSFERENCIA_${ref}` : `TRANSFERENCIA_${Date.now()}`,
        };
    }

    throw crearErrorPago('El proveedor no corresponde a un método de pago presencial.');
}

export class PagoService {
    constructor({ env = process.env, fetchImpl = fetch, clock = () => new Date() } = {}) {
        this.env = env;
        this.fetch = fetchImpl;
        this.clock = clock;
        this.mpAccessToken = env.MP_ACCESS_TOKEN?.trim() || null;
        this.frontendUrl = env.FRONTEND_URL || 'http://localhost:5173';
        this.mpWebhookSecret = env.MP_WEBHOOK_SECRET?.trim() || null;
        this.mpPaymentTtlMinutes = env.MP_PAYMENT_TTL_MINUTES === undefined
            ? 30
            : Number(env.MP_PAYMENT_TTL_MINUTES);
    }

    obtenerExpiracionPagoDigital(fechaCreacion = this.clock()) {
        if (
            !Number.isSafeInteger(this.mpPaymentTtlMinutes)
            || this.mpPaymentTtlMinutes < 1
            || this.mpPaymentTtlMinutes > 1440
        ) {
            throw crearErrorPago('MP_PAYMENT_TTL_MINUTES debe ser un entero entre 1 y 1440.', 503);
        }
        return new Date(new Date(fechaCreacion).getTime() + this.mpPaymentTtlMinutes * 60_000);
    }

    validarConfiguracionSandbox() {
        if (!this.mpAccessToken) {
            throw crearErrorPago('Configura MP_ACCESS_TOKEN con un token de prueba de Mercado Pago.', 503);
        }
        if (!this.mpAccessToken.startsWith('TEST-') && !this.mpAccessToken.startsWith('APP_USR-')) {
            throw crearErrorPago('El Access Token de Mercado Pago debe comenzar con TEST- o APP_USR-.', 503);
        }
    }

    /**
     * Genera un identificador de idempotencia UUID v4 seguro si no se proporciona.
     */
    generarIdempotenciaKey() {
        return crypto.randomUUID();
    }

    async registrarMovimientoCobro(tx, {
        empresaId,
        sucursalId,
        aperturaCajaId,
        empleadoId,
        ventaId,
        transaccionPagoId = null,
        monto,
        concepto = null,
        proveedor = 'EFECTIVO',
        estado = null,
    }) {
        if (!tx?.movimientoCaja) {
            throw crearErrorPago('Se requiere la transacción de base de datos para registrar el movimiento de caja.');
        }

        for (const [nombre, valor] of Object.entries({ aperturaCajaId, empleadoId })) {
            if (!Number.isSafeInteger(Number(valor)) || Number(valor) < 1) {
                throw crearErrorPago(`El identificador de ${nombre} no es válido.`);
            }
        }

        const montoNumerico = Number(monto);
        if (!Number.isFinite(montoNumerico) || montoNumerico <= 0) {
            return null;
        }

        if (transaccionPagoId) {
            const existente = await tx.movimientoCaja.findFirst({
                where: {
                    transaccionPagoId: Number(transaccionPagoId),
                    origen: 'COBRO_VENTA',
                    deletedAt: null,
                },
                select: { id: true, estado: true },
            });
            if (existente) {
                if (estado && estado !== existente.estado) {
                    return tx.movimientoCaja.update({
                        where: { id: existente.id },
                        data: { estado },
                    });
                }
                return existente;
            }
        }

        const esEfectivo = proveedor === 'EFECTIVO';
        const estadoMovimiento = estado ?? (proveedor === 'TRANSFERENCIA' ? 'PENDIENTE' : 'VALIDADO');

        return tx.movimientoCaja.create({
            data: {
                empresaId: Number(empresaId),
                sucursalId: Number(sucursalId),
                aperturaCajaId: Number(aperturaCajaId),
                empleadoId: Number(empleadoId),
                tipo: 'ENTRADA',
                origen: 'COBRO_VENTA',
                monto: montoNumerico,
                concepto: concepto || `Cobro de venta (${proveedor})`,
                estado: estadoMovimiento,
                afectaEfectivo: esEfectivo,
                ventaId: ventaId ? Number(ventaId) : null,
                transaccionPagoId: transaccionPagoId ? Number(transaccionPagoId) : null,
            },
        });
    }

    async registrarCobroVenta(tx, {
        empresaId,
        sucursalId,
        ventaId,
        aperturaCajaId,
        empleadoId,
        folioVenta,
        proveedor,
        monto,
        uuidIdempotencia = null,
        efectivoRecibido = null,
        cambio = 0,
        folioVoucher = null,
        tipoTarjeta = null,
        marcaTarjeta = null,
        ultimosDigitos = null,
        referenciaTransferencia = null,
    }) {
        if (!tx?.transaccionPago) {
            throw crearErrorPago('Se requiere la transacción de base de datos de la venta.');
        }

        for (const [nombre, valor] of Object.entries({ empresaId, sucursalId, ventaId })) {
            if (!Number.isSafeInteger(Number(valor)) || Number(valor) < 1) {
                throw crearErrorPago(`El identificador de ${nombre} no es válido.`);
            }
        }

        const montoNumerico = Number(monto);
        if (!Number.isFinite(montoNumerico) || montoNumerico < 0) {
            throw crearErrorPago('El monto del cobro no es válido.');
        }
        const cobro = resolverCobroPresencial({
            proveedor,
            monto: montoNumerico,
            efectivoRecibido,
            folioVoucher,
            tipoTarjeta,
            marcaTarjeta,
            ultimosDigitos,
            referenciaTransferencia,
            exigirDatosCompletos: true,
        });

        const voucher = proveedor === 'TERMINAL_MANUAL' && typeof folioVoucher === 'string' && folioVoucher.trim()
            ? folioVoucher.trim()
            : null;
        if (voucher) {
            const existente = await tx.transaccionPago.findFirst({
                where: {
                    empresaId: Number(empresaId),
                    proveedor,
                    folioVoucher: voucher,
                },
                select: { id: true },
            });
            if (existente) {
                throw crearErrorPago(`El folio ${voucher} ya fue registrado en otra transacción.`, 409);
            }
        }

        try {
            const transaccion = await tx.transaccionPago.create({
                data: {
                    ventaId: Number(ventaId),
                    empresaId: Number(empresaId),
                    sucursalId: Number(sucursalId),
                    uuidIdempotencia: uuidIdempotencia || this.generarIdempotenciaKey(),
                    proveedor,
                    referenciaExterna: cobro.referenciaExterna,
                    monto: montoNumerico,
                    moneda: 'MXN',
                    estado: cobro.estado,
                    concepto: `Venta folio ${folioVenta}`,
                    folioVoucher: voucher,
                    metadatos: proveedor === 'EFECTIVO'
                        ? {
                              efectivoRecibido: Number(efectivoRecibido),
                              cambio: Number(cambio),
                          }
                        : (proveedor === 'TERMINAL_MANUAL'
                            ? {
                                  tipoTarjeta: normalizarValorTarjeta(tipoTarjeta) || 'DEBITO',
                                  marcaTarjeta: normalizarValorTarjeta(marcaTarjeta) || 'VISA',
                                  ultimosDigitos: String(ultimosDigitos || ''),
                              }
                            : {
                                  metodo: 'TRANSFERENCIA',
                                  ...(referenciaTransferencia?.trim() ? { referencia: referenciaTransferencia.trim() } : {}),
                                  confirmada: false,
                              }),
                },
            });

            if (montoNumerico > 0 && (cobro.estado === 'APROBADO' || cobro.estado === 'PENDIENTE')) {
                const nombreMetodo = proveedor === 'EFECTIVO'
                    ? 'en efectivo'
                    : (proveedor === 'TRANSFERENCIA' ? 'por transferencia' : 'con tarjeta');
                await this.registrarMovimientoCobro(tx, {
                    empresaId: Number(empresaId),
                    sucursalId: Number(sucursalId),
                    aperturaCajaId: Number(aperturaCajaId),
                    empleadoId: Number(empleadoId),
                    ventaId: Number(ventaId),
                    transaccionPagoId: transaccion.id,
                    monto: montoNumerico,
                    concepto: `Cobro ${nombreMetodo} de venta folio ${folioVenta}`,
                    proveedor,
                });
            }

            return transaccion;
        } catch (error) {
            if (voucher && error?.code === 'P2002') {
                throw crearErrorPago(`El folio ${voucher} ya fue registrado en otra transacción.`, 409);
            }
            throw error;
        }
    }

    async registrarCobroDigitalVenta(tx, {
            empresaId,
            sucursalId,
            aperturaCajaId = null,
            empleadoId = null,
            ventaId,
            folioVenta,
            monto,
            correoCliente = null,
            uuidIdempotencia,
            requestHash,
        }) {
            if (!tx?.transaccionPago) {
                throw crearErrorPago('Se requiere la transacción de base de datos de la venta.');
            }
            if (!/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(uuidIdempotencia ?? '')) {
                throw crearErrorPago('La llave de idempotencia para Mercado Pago no es válida.');
            }

            const montoNumerico = Number(monto);
            if (!Number.isFinite(montoNumerico) || montoNumerico <= 0) {
                throw crearErrorPago('El monto debe ser mayor a cero para cobrar con Mercado Pago.');
            }

            const venceEn = this.obtenerExpiracionPagoDigital();
            const transaccion = await tx.transaccionPago.create({
                data: {
                    ventaId: Number(ventaId),
                    empresaId: Number(empresaId),
                    sucursalId: Number(sucursalId),
                    uuidIdempotencia,
                    proveedor: 'MERCADO_PAGO',
                    referenciaExterna: uuidIdempotencia,
                    monto: montoNumerico,
                    moneda: 'MXN',
                    estado: 'PENDIENTE',
                    concepto: `Venta folio ${folioVenta}`,
                    correoCliente: correoCliente?.trim() || null,
                    metadatos: {
                        expiresAt: venceEn.toISOString(),
                        requestHash,
                    },
                },
            });

            if (aperturaCajaId && empleadoId) {
                await this.registrarMovimientoCobro(tx, {
                    empresaId: Number(empresaId),
                    sucursalId: Number(sucursalId),
                    aperturaCajaId: Number(aperturaCajaId),
                    empleadoId: Number(empleadoId),
                    ventaId: Number(ventaId),
                    transaccionPagoId: transaccion.id,
                    monto: montoNumerico,
                    concepto: `Cobro digital Mercado Pago de venta folio ${folioVenta}`,
                    proveedor: 'MERCADO_PAGO',
                    estado: 'PENDIENTE',
                });
            }

            return transaccion;
        }

    async prepararCheckoutVenta(ventaId, empresaId) {
            const transaccion = await transaccionPagoDao.model.findFirst({
                where: {
                    ventaId: Number(ventaId),
                    empresaId: Number(empresaId),
                    proveedor: 'MERCADO_PAGO',
                    deletedAt: null,
                },
                include: { venta: { select: { estado: true } } },
            });
            if (!transaccion) {
                throw crearErrorPago('No se encontró el cobro digital asociado a la venta.', 404);
            }
            if (['completada', 'completado'].includes(String(transaccion.venta?.estado ?? '').toLowerCase())) {
                return { estado: transaccion.estado, urlCheckout: null, yaPagada: true };
            }
            if (transaccion.venta?.estado !== 'pendiente_pago') {
                throw crearErrorPago('La venta ya no puede continuar en el checkout.', 409);
            }

            const venceEn = new Date(
                transaccion.metadatos?.expiresAt
                    ?? this.obtenerExpiracionPagoDigital(transaccion.createdAt)
            );
            if (venceEn <= this.clock()) {
                const { ventaDao } = await import('../dao/VentaDao.js');
                await ventaDao.expirarVentaPendientePago(transaccion.ventaId, this.clock());
                throw crearErrorPago('El tiempo para pagar venció. Inicia una nueva venta.', 409);
            }

            if (transaccion.urlCheckout) {
                if (transaccion.metadatos?.sandbox !== true) {
                    throw crearErrorPago('El checkout asociado no está identificado como sandbox.', 409);
                }
                return {
                    estado: transaccion.estado,
                    urlCheckout: transaccion.urlCheckout,
                    venceEn: venceEn.toISOString(),
                };
            }

            this.validarConfiguracionSandbox();
            const urlRetorno = new URL('/registro-de-ventas/nueva', this.frontendUrl);
            urlRetorno.searchParams.set('ventaId', String(ventaId));
            urlRetorno.searchParams.set('mp_return', '1');

            const preferenceBody = {
                items: [{
                    id: `venta_${ventaId}`,
                    title: transaccion.concepto,
                    quantity: 1,
                    currency_id: 'MXN',
                    unit_price: Number(transaccion.monto),
                }],
                external_reference: transaccion.uuidIdempotencia,
                statement_descriptor: 'APEXGYM',
                back_urls: {
                    success: urlRetorno.toString(),
                    failure: urlRetorno.toString(),
                    pending: urlRetorno.toString(),
                },
            };

            if (urlRetorno.protocol === 'https:') {
                preferenceBody.auto_return = 'approved';
            }
            if (transaccion.correoCliente) {
                preferenceBody.payer = { email: transaccion.correoCliente };
            }

            const rawNotificationUrl = this.env.MP_NOTIFICATION_URL?.trim()
                || (urlRetorno.protocol === 'https:' ? `${urlRetorno.origin}/api/pagos/webhook` : null);
            if (rawNotificationUrl) {
                try {
                    const urlNotificacion = new URL(rawNotificationUrl);
                    if (urlNotificacion.protocol === 'https:') {
                        preferenceBody.notification_url = urlNotificacion.toString();
                    }
                } catch {
                    // Ignorar si URL de notificación no es válida
                }
            }

            let response;
            try {
                response = await this.fetch('https://api.mercadopago.com/checkout/preferences', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${this.mpAccessToken}`,
                        'Content-Type': 'application/json',
                        'X-Idempotency-Key': transaccion.uuidIdempotencia,
                    },
                    body: JSON.stringify(preferenceBody),
                });
            } catch {
                throw crearErrorPago('No se pudo conectar con Mercado Pago. Reintenta la misma venta para recuperar el checkout.', 502);
            }

            const mpData = await response.json().catch(() => null);
            const checkoutUrl = mpData?.init_point || mpData?.sandbox_init_point;
            if (!response.ok || !checkoutUrl || !mpData?.id) {
                const detalle = mpData?.message || mpData?.error || `HTTP ${response.status}`;
                throw crearErrorPago(`Mercado Pago no pudo crear el checkout: ${detalle}`, 502);
            }

            await transaccionPagoDao.model.update({
                where: { id: transaccion.id },
                data: {
                    referenciaExterna: String(mpData.id),
                    urlCheckout: checkoutUrl,
                    metadatos: {
                        ...(transaccion.metadatos ?? {}),
                        sandbox: true,
                    },
                    datosRespuesta: JSON.stringify({
                        preferenceId: String(mpData.id),
                        sandbox: true,
                        createdAt: this.clock().toISOString(),
                    }),
                },
            });

            return {
                estado: transaccion.estado,
                urlCheckout: checkoutUrl,
                venceEn: venceEn.toISOString(),
            };
        }

    async obtenerPagoMercadoPago(paymentId) {
            this.validarConfiguracionSandbox();
            if (!/^\d+$/.test(String(paymentId ?? ''))) {
                throw crearErrorPago('El identificador del pago de Mercado Pago no es válido.');
            }

            let response;
            try {
                response = await this.fetch(
                    `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
                    { headers: { Authorization: `Bearer ${this.mpAccessToken}` } }
                );
            } catch {
                throw crearErrorPago('No se pudo consultar el pago en Mercado Pago.', 502);
            }
            const pago = await response.json().catch(() => null);
            if (!response.ok || !pago?.id) {
                throw crearErrorPago('Mercado Pago no pudo confirmar el estado del pago.', 502);
            }
            return pago;
        }

    async buscarPagoMercadoPagoPorReferencia(externalReference) {
        this.validarConfiguracionSandbox();
        if (!externalReference) return null;

        let response;
        try {
            response = await this.fetch(
                `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(externalReference)}`,
                { headers: { Authorization: `Bearer ${this.mpAccessToken}` } }
            );
        } catch {
            return null;
        }

        const data = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(data?.results) || data.results.length === 0) {
            return null;
        }

        const pagos = data.results.sort((a, b) => new Date(b.date_created) - new Date(a.date_created));
        return pagos[0] ?? null;
    }

    async consultarEstadoVenta(ventaId, empresaId, paymentId = null) {
        const { ventaDao } = await import('../dao/VentaDao.js');

        let transaccion = await transaccionPagoDao.model.findFirst({
            where: {
                ventaId: Number(ventaId),
                empresaId: Number(empresaId),
                proveedor: 'MERCADO_PAGO',
                deletedAt: null,
            },
            select: {
                id: true,
                uuidIdempotencia: true,
                estado: true,
                monto: true,
                urlCheckout: true,
                metadatos: true,
            },
        });
        if (!transaccion) {
            throw crearErrorPago('No se encontró el pago digital de esta venta.', 404);
        }

        if (transaccion.estado === 'PENDIENTE') {
            let paymentData = null;
            if (paymentId) {
                paymentData = await this.obtenerPagoMercadoPago(paymentId).catch(() => null);
            } else if (transaccion.uuidIdempotencia) {
                paymentData = await this.buscarPagoMercadoPagoPorReferencia(transaccion.uuidIdempotencia);
            }

            if (paymentData) {
                await ventaDao.resolverPagoMercadoPago(paymentData, Number(empresaId));
                transaccion = await transaccionPagoDao.model.findFirst({
                    where: { id: transaccion.id },
                    select: {
                        id: true,
                        uuidIdempotencia: true,
                        estado: true,
                        monto: true,
                        urlCheckout: true,
                        metadatos: true,
                    },
                });
            } else {
                await ventaDao.expirarVentasDigitalesPendientes(Number(ventaId));
            }
        }

        const venta = await transaccionPagoDao.prisma.venta.findFirst({
            where: { id: Number(ventaId), deletedAt: null },
            select: { id: true, estado: true, motivoCancelacion: true },
        });
        if (!venta) throw crearErrorPago('La venta no existe.', 404);

        return {
            venta,
            pago: {
                estado: transaccion.estado,
                monto: Number(transaccion.monto),
                urlCheckout: transaccion.urlCheckout,
                venceEn: transaccion.metadatos?.expiresAt ?? null,
                requiereReembolsoManual: transaccion.metadatos?.requiereReembolsoManual === true,
            },
        };
    }

    async procesarWebhook(query = {}, body = {}, headers = {}) {
        const paymentId = String(
            query['data.id'] ?? body?.data?.id ?? query.id ?? body?.id ?? ''
        );
        if (!paymentId) {
            return { recibido: true, procesado: false, motivo: 'Notificación sin paymentId' };
        }

        if (this.mpWebhookSecret) {
            const firmaValida = verificarFirmaMercadoPago({
                firma: headers['x-signature'],
                requestId: headers['x-request-id'],
                paymentId,
                secreto: this.mpWebhookSecret,
            });
            if (!firmaValida) {
                throw crearErrorPago('La firma de la notificación de Mercado Pago no es válida.', 401);
            }
        }

        const paymentData = await this.obtenerPagoMercadoPago(paymentId);
        const transaccion = await transaccionPagoDao.model.findFirst({
            where: {
                uuidIdempotencia: paymentData.external_reference,
                proveedor: 'MERCADO_PAGO',
                deletedAt: null,
            },
        });
        if (!transaccion) {
            throw crearErrorPago('No existe una transacción local asociada a este pago.', 404);
        }

        let resultado;
        if (transaccion.ventaId != null) {
            const { ventaDao } = await import('../dao/VentaDao.js');
            resultado = await ventaDao.resolverPagoMercadoPago(paymentData, transaccion.empresaId);
        } else {
            if (
                !Number.isFinite(Number(paymentData.transaction_amount))
                || Math.round(Number(paymentData.transaction_amount) * 100) !== Math.round(Number(transaccion.monto) * 100)
                || paymentData.currency_id !== transaccion.moneda
            ) {
                throw crearErrorPago('El monto o la moneda del pago no coincide con la transacción.', 409);
            }
            const estado = paymentData.status === 'approved'
                ? 'APROBADO'
                : ['rejected', 'cancelled'].includes(paymentData.status)
                    ? 'RECHAZADO'
                    : paymentData.status === 'refunded'
                        ? 'REEMBOLSADO'
                        : 'PENDIENTE';
            await transaccionPagoDao.actualizarEstado(
                transaccion.id,
                estado,
                {
                    paymentId: String(paymentData.id),
                    status: paymentData.status,
                    statusDetail: paymentData.status_detail ?? null,
                    amount: Number(paymentData.transaction_amount),
                    currency: paymentData.currency_id,
                },
                transaccion.empresaId
            );
            resultado = { procesado: true, estado };
        }
        return {
            recibido: true,
            procesado: resultado.procesado,
            estado: resultado.estado,
        };
    }
}

export const pagoService = new PagoService();
