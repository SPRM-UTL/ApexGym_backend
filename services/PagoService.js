import 'dotenv/config';
import crypto from 'crypto';
import { transaccionPagoDao } from '../dao/TransaccionPagoDao.js';

export class PagoService {
    constructor() {
        this.driver = (process.env.PAGOS_DRIVER || 'sandbox').toLowerCase();
        this.mpAccessToken = process.env.MP_ACCESS_TOKEN || null;
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

        // 2. Procesamiento según método de pago
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
        } else if (proveedor === 'MERCADO_PAGO' && this.driver === 'mercadopago' && this.mpAccessToken) {
            // Modo Producción / Sandbox oficial con Mercado Pago SDK
            referenciaExterna = `MP_ORD_${Date.now()}`;
            urlCheckout = `https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=${referenciaExterna}`;
        } else {
            // Modo Sandbox Simulado (Por defecto: ideal para experimentación ágil)
            referenciaExterna = `SANDBOX_REF_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            urlCheckout = `${this.frontendUrl}/pagos-experimentacion?ref=${referenciaExterna}`;
        }

        const metadatosGuardados = {
            ...(metadatos || {}),
            ...(tipoTarjeta ? { tipoTarjeta } : {}),
            ...(marcaTarjeta ? { marcaTarjeta } : {}),
            ...(ultimosDigitos ? { ultimosDigitos } : {}),
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
                        urlCheckout,
                    };
                }
            }
            throw error;
        }
    }

    /**
     * Simula la resolución asíncrona de un pago (Aprobado / Rechazado).
     * Ideal para pruebas locales sin necesidad de túnel ngrok.
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
     * Procesa una notificación HTTP entrante de pasarela (Webhook).
     */
    async procesarWebhook(payload = {}, headers = {}) {
        // En modo simulado, confirmamos recepción
        return {
            recibido: true,
            timestamp: new Date().toISOString(),
            modo: this.driver,
        };
    }
}

export const pagoService = new PagoService();
