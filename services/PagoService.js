import 'dotenv/config';
import crypto from 'crypto';
import { transaccionPagoDao } from '../dao/TransaccionPagoDao.js';

export class PagoService {
    constructor() {
        this.driver = (process.env.PAGOS_DRIVER || 'sandbox').toLowerCase();
        this.mpAccessToken = process.env.MP_ACCESS_TOKEN?.trim() || null;
        this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    }

    /**
     * Genera un identificador de idempotencia UUID v4 seguro si no se proporciona.
     */
    generarIdempotenciaKey() {
        return crypto.randomUUID();
    }

    /**
     * Crea una intención o preferencia de cobro respetando idempotencia.
     */
    async crearCobro({
        empresaId = 1,
        concepto,
        monto,
        correoCliente = null,
        uuidIdempotencia = null,
        proveedor = 'SANDBOX_SIMULADO',
        folioVoucher = null,
        tipoTarjeta = null,
        marcaTarjeta = null,
        ultimosDigitos = null,
        metadatos = null,
    }) {
        if (!concepto || typeof concepto !== 'string' || !concepto.trim()) {
            throw new Error('El concepto del pago es obligatorio.');
        }

        const montoNumerico = Number(monto);
        if (!Number.isFinite(montoNumerico) || montoNumerico <= 0) {
            throw new Error('El monto debe ser un valor numérico mayor a cero.');
        }

        const llaveIdempotencia = uuidIdempotencia?.trim() || this.generarIdempotenciaKey();

        // 1. Verificación de Idempotencia: evitar doble cobro si el cliente reintenta
        const existente = await transaccionPagoDao.buscarPorIdempotencia(llaveIdempotencia, empresaId);
        if (existente) {
            return {
                idempotente: true,
                mensaje: 'Transacción recuperada por llave de idempotencia (sin doble cobro)',
                transaccion: existente,
                urlCheckout: existente.urlCheckout,
            };
        }

        // 2. Verificación estricta de Voucher físico: un voucher no puede registrarse dos veces
        if (proveedor === 'TERMINAL_MANUAL' && folioVoucher && folioVoucher.trim()) {
            const voucherExistente = await transaccionPagoDao.model.findFirst({
                where: {
                    empresaId,
                    folioVoucher: folioVoucher.trim(),
                    deletedAt: null,
                },
                orderBy: { id: 'desc' },
            });

            if (voucherExistente) {
                return {
                    idempotente: true,
                    mensaje: `El folio ${folioVoucher.trim()} ya fue registrado en la transacción #${voucherExistente.id}`,
                    transaccion: voucherExistente,
                };
            }
        }

        // 3. Ventana de protección anti-doble clic rápido (Deduplicación por huella en los últimos 8 segundos)
        const ventanaSeguridad = new Date(Date.now() - 8000);
        const transaccionReciente = await transaccionPagoDao.model.findFirst({
            where: {
                empresaId,
                concepto: concepto.trim(),
                monto: montoNumerico,
                proveedor,
                createdAt: {
                    gte: ventanaSeguridad,
                },
                deletedAt: null,
            },
            orderBy: { id: 'desc' },
        });

        if (transaccionReciente) {
            return {
                idempotente: true,
                mensaje: `Se detectó un cobro idéntico en curso. Se recuperó la transacción #${transaccionReciente.id} para evitar duplicados`,
                transaccion: transaccionReciente,
                urlCheckout: transaccionReciente.urlCheckout,
            };
        }

        let estadoInicial = 'PENDIENTE';
        let referenciaExterna = null;
        let urlCheckout = null;

        // 4. Procesamiento según método de pago
        if (proveedor === 'EFECTIVO') {
            const efectivoRecibido = metadatos?.efectivoRecibido !== undefined ? Number(metadatos.efectivoRecibido) : null;
            if (efectivoRecibido !== null && efectivoRecibido < montoNumerico) {
                throw new Error(`Efectivo insuficiente: Se entregaron $${efectivoRecibido.toFixed(2)} MXN pero el monto es $${montoNumerico.toFixed(2)} MXN.`);
            }
            estadoInicial = 'APROBADO';
            referenciaExterna = `EFECTIVO_${Date.now()}`;
        } else if (proveedor === 'TERMINAL_MANUAL') {
            if (!folioVoucher || !folioVoucher.trim()) {
                throw new Error('Para cobros en terminal física manual se requiere el folio/autorización del voucher.');
            }
            estadoInicial = 'APROBADO';
            referenciaExterna = `TERM_MANUAL_${folioVoucher.trim()}`;
        } else {
            // Cobro Digital / En Línea: verificar si existe Access Token de Mercado Pago
            const tokenMercadoPago = process.env.MP_ACCESS_TOKEN?.trim() || this.mpAccessToken;
            const tieneTokenMercadoPago = Boolean(tokenMercadoPago && tokenMercadoPago.length > 20);

            if (tieneTokenMercadoPago) {
                proveedor = 'MERCADO_PAGO';
                try {
                    const preferenceBody = {
                        items: [
                            {
                                id: `apex_${Date.now()}`,
                                title: concepto.trim(),
                                quantity: 1,
                                currency_id: 'MXN',
                                unit_price: montoNumerico,
                            },
                        ],
                        ...(correoCliente?.trim()
                            ? {
                                  payer: {
                                      email: correoCliente.trim(),
                                  },
                              }
                            : {}),
                        back_urls: {
                            success: `${this.frontendUrl}/pagos-experimentacion?estado=aprobado`,
                            failure: `${this.frontendUrl}/pagos-experimentacion?estado=fallido`,
                            pending: `${this.frontendUrl}/pagos-experimentacion?estado=pendiente`,
                        },
                        external_reference: `APEX_${empresaId}_${Date.now()}`,
                        statement_descriptor: 'APEXGYM',
                    };

                    // auto_return solo es válido en Mercado Pago con dominios HTTPS públicos; en localhost se omite para evitar error 400
                    if (this.frontendUrl.startsWith('https://')) {
                        preferenceBody.auto_return = 'approved';
                    }

                    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${tokenMercadoPago}`,
                            'Content-Type': 'application/json',
                            'X-Idempotency-Key': llaveIdempotencia,
                        },
                        body: JSON.stringify(preferenceBody),
                    });

                    const mpData = await mpResponse.json();
                    if (mpResponse.ok && (mpData.init_point || mpData.sandbox_init_point)) {
                        referenciaExterna = mpData.id;
                        urlCheckout = mpData.init_point || mpData.sandbox_init_point;
                        estadoInicial = 'PENDIENTE';
                    } else {
                        console.error('Error al generar preferencia en Mercado Pago:', mpData);
                        referenciaExterna = `FALLBACK_MP_${Date.now()}`;
                        urlCheckout = `${this.frontendUrl}/pagos-experimentacion?ref=${referenciaExterna}`;
                    }
                } catch (mpErr) {
                    console.error('Fallo de conexión con API de Mercado Pago:', mpErr);
                    referenciaExterna = `ERROR_MP_${Date.now()}`;
                    urlCheckout = `${this.frontendUrl}/pagos-experimentacion?ref=${referenciaExterna}`;
                }
            } else {
                // Modo Sandbox Simulado local por defecto
                referenciaExterna = `SANDBOX_REF_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
                urlCheckout = `${this.frontendUrl}/pagos-experimentacion?ref=${referenciaExterna}`;
            }
        }

        const metadatosGuardados = {
            ...(metadatos || {}),
            ...(tipoTarjeta ? { tipoTarjeta } : {}),
            ...(marcaTarjeta ? { marcaTarjeta } : {}),
            ...(ultimosDigitos ? { ultimosDigitos } : {}),
            pasarelaReal: Boolean(this.mpAccessToken && this.mpAccessToken.length > 20),
        };

        try {
            const nuevaTransaccion = await transaccionPagoDao.create({
                empresaId,
                uuidIdempotencia: llaveIdempotencia,
                proveedor,
                referenciaExterna,
                monto: montoNumerico,
                moneda: 'MXN',
                estado: estadoInicial,
                concepto: concepto.trim(),
                correoCliente: correoCliente?.trim() || null,
                folioVoucher: folioVoucher?.trim() || null,
                urlCheckout,
                metadatos: metadatosGuardados,
            });

            return {
                idempotente: false,
                mensaje: estadoInicial === 'APROBADO' ? 'Pago procesado de inmediato' : 'Orden de cobro generada en espera de confirmación',
                transaccion: nuevaTransaccion,
                urlCheckout,
            };
        } catch (error) {
            if (error?.code === 'P2002' || error?.message?.includes('uuid_idempotencia')) {
                const transaccionExistente = await transaccionPagoDao.buscarPorIdempotencia(llaveIdempotencia, empresaId);
                if (transaccionExistente) {
                    return {
                        idempotente: true,
                        mensaje: 'Transacción recuperada por llave de idempotencia (concurrencia prevenida)',
                        transaccion: transaccionExistente,
                        urlCheckout: transaccionExistente.urlCheckout,
                    };
                }
            }
            throw error;
        }
    }

    /**
     * Simula la resolución asíncrona de un pago (Aprobado / Rechazado).
     */
    async simularResolucion(id, nuevoEstado, empresaId = 1) {
        const estadosValidos = ['APROBADO', 'RECHAZADO', 'EXPIRADO'];
        if (!estadosValidos.includes(nuevoEstado)) {
            throw new Error(`Estado no válido para simulación. Válidos: ${estadosValidos.join(', ')}`);
        }

        const transaccion = await transaccionPagoDao.getById(id, empresaId);
        if (!transaccion) {
            throw new Error('La transacción de pago no existe.');
        }

        if (transaccion.estado === 'REEMBOLSADO') {
            throw new Error('No se puede cambiar el estado de una transacción ya reembolsada.');
        }

        const datosRespuesta = {
            simulado: true,
            fechaResolucion: new Date().toISOString(),
            mensaje: `Transacción resuelta a ${nuevoEstado} mediante el Simulador de Pruebas`,
        };

        const actualizada = await transaccionPagoDao.actualizarEstado(id, nuevoEstado, datosRespuesta, empresaId);

        return {
            mensaje: `Transacción ${id} actualizada exitosamente a ${nuevoEstado}`,
            transaccion: actualizada,
        };
    }

    /**
     * Aplica un reembolso a una transacción previamente aprobada.
     */
    async reembolsar(id, motivo = 'Reembolso solicitado en mostrador', empresaId = 1) {
        const transaccion = await transaccionPagoDao.getById(id, empresaId);
        if (!transaccion) {
            throw new Error('La transacción no existe.');
        }

        if (transaccion.estado !== 'APROBADO') {
            throw new Error(`Solo se pueden reembolsar transacciones en estado APROBADO. Estado actual: ${transaccion.estado}`);
        }

        const datosRespuesta = {
            reembolso: true,
            motivo,
            fechaReembolso: new Date().toISOString(),
        };

        const actualizada = await transaccionPagoDao.actualizarEstado(id, 'REEMBOLSADO', datosRespuesta, empresaId);

        return {
            mensaje: `Transacción ${id} reembolsada exitosamente`,
            transaccion: actualizada,
        };
    }

    /**
     * Sincroniza automáticamente transacciones pendientes con pagos aprobados en Mercado Pago.
     */
    async sincronizarConMercadoPago(empresaId = 1) {
        const token = process.env.MP_ACCESS_TOKEN?.trim() || this.mpAccessToken;
        if (!token) return;

        try {
            const resp = await fetch('https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&limit=10', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!resp.ok) return;
            const data = await resp.json();
            const pagos = data.results || [];

            for (const pago of pagos) {
                if (pago.status === 'approved') {
                    const extRef = pago.external_reference;
                    const transaccion = await transaccionPagoDao.model.findFirst({
                        where: {
                            empresaId,
                            estado: 'PENDIENTE',
                            deletedAt: null,
                            OR: [
                                ...(extRef ? [{ referenciaExterna: extRef }] : []),
                                { monto: Number(pago.transaction_amount) }
                            ]
                        },
                        orderBy: { id: 'desc' }
                    });

                    if (transaccion) {
                        await transaccionPagoDao.actualizarEstado(
                            transaccion.id,
                            'APROBADO',
                            {
                                mercadoPagoPaymentId: pago.id,
                                metodo: pago.payment_method_id,
                                status: pago.status,
                                statusDetail: pago.status_detail,
                                fechaAprobado: pago.date_approved
                            },
                            empresaId
                        );
                    }
                }
            }
        } catch (err) {
            console.error('Error al sincronizar con Mercado Pago:', err.message);
        }
    }

    /**
     * Procesa una notificación HTTP entrante de pasarela (Webhook de Mercado Pago).
     */
    async procesarWebhook(query = {}, body = {}) {
        const paymentId = query['data.id'] || query.id || body?.data?.id || body?.id;
        const topic = query.type || query.topic || body?.type || body?.action;

        if (paymentId && this.mpAccessToken) {
            try {
                const resp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                    headers: {
                        'Authorization': `Bearer ${this.mpAccessToken}`,
                    },
                });

                if (resp.ok) {
                    const paymentData = await resp.json();
                    const status = paymentData.status; // 'approved', 'rejected', 'pending'
                    const externalRef = paymentData.external_reference;

                    let nuevoEstado = 'PENDIENTE';
                    if (status === 'approved') nuevoEstado = 'APROBADO';
                    else if (status === 'rejected' || status === 'cancelled') nuevoEstado = 'RECHAZADO';
                    else if (status === 'refunded') nuevoEstado = 'REEMBOLSADO';

                    // Buscar transacción local por referencia o id
                    const transaccion = await transaccionPagoDao.model.findFirst({
                        where: {
                            OR: [
                                { referenciaExterna: externalRef },
                                { id: Number(externalRef?.split('_')[2]) || -1 },
                            ],
                            deletedAt: null,
                        },
                    });

                    if (transaccion) {
                        await transaccionPagoDao.actualizarEstado(
                            transaccion.id,
                            nuevoEstado,
                            { webhookMercadoPago: paymentData },
                            transaccion.empresaId
                        );
                    }
                }
            } catch (err) {
                console.error('Error procesando webhook en vivo:', err);
            }
        }

        return {
            recibido: true,
            timestamp: new Date().toISOString(),
        };
    }
}

export const pagoService = new PagoService();
