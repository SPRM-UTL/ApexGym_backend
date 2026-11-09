import { BaseController } from './BaseController.js';
import { transaccionPagoDao } from '../dao/TransaccionPagoDao.js';
import { pagoService } from '../services/PagoService.js';

export class PagoController extends BaseController {
    constructor() {
        super(transaccionPagoDao);
    }

    /**
     * GET /api/pagos/transacciones
     * Lista transacciones sincronizando automáticamente con Mercado Pago.
     */
    obtenerTodos = async (req, res) => {
        try {
            const empresaId = this.obtenerEmpresaId(req);
            await pagoService.sincronizarConMercadoPago(empresaId).catch(() => {});
            const filtroEmpresa = this.dao?.useEmpresa ? { empresaId } : {};
            const registros = await this.dao.getAll(filtroEmpresa, { id: 'desc' }, empresaId);
            return this.respuestaExito(res, registros || [], "Registros obtenidos exitosamente");
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    /**
     * POST /api/pagos/crear-cobro
     * Genera una preferencia o registro de cobro con soporte de idempotencia.
     */
    crearCobro = async (req, res) => {
        try {
            const empresaId = this.obtenerEmpresaId(req);
            const uuidIdempotencia = req.headers['x-idempotency-key'] || req.body.uuidIdempotencia;

            const resultado = await pagoService.crearCobro({
                empresaId,
                concepto: req.body.concepto,
                monto: req.body.monto,
                correoCliente: req.body.correoCliente,
                uuidIdempotencia,
                proveedor: req.body.proveedor,
                folioVoucher: req.body.folioVoucher,
                tipoTarjeta: req.body.tipoTarjeta,
                marcaTarjeta: req.body.marcaTarjeta,
                ultimosDigitos: req.body.ultimosDigitos,
                metadatos: req.body.metadatos,
            });

            return this.respuestaExito(res, resultado, resultado.mensaje, this.statusOk);
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    /**
     * POST /api/pagos/simular-resolucion/:id
     * Endpoint experimental para cambiar el estado de un pago sin necesidad de túnel ngrok.
     */
    simularResolucion = async (req, res) => {
        try {
            const empresaId = this.obtenerEmpresaId(req);
            const id = Number(req.params.id);
            const nuevoEstado = req.body.estado || 'APROBADO';

            const resultado = await pagoService.simularResolucion(id, nuevoEstado, empresaId);
            return this.respuestaExito(res, resultado, resultado.mensaje, this.statusOk);
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    /**
     * POST /api/pagos/reembolsar/:id
     * Revierte un cobro previamente aprobado.
     */
    reembolsar = async (req, res) => {
        try {
            const empresaId = this.obtenerEmpresaId(req);
            const id = Number(req.params.id);
            const motivo = req.body.motivo;

            const resultado = await pagoService.reembolsar(id, motivo, empresaId);
            return this.respuestaExito(res, resultado, resultado.mensaje, this.statusOk);
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    /**
     * GET /api/pagos/resumen
     * Métricas financieras y auditoría de transacciones para el gimnasio.
     */
    obtenerResumen = async (req, res) => {
        try {
            const empresaId = this.obtenerEmpresaId(req);
            const resumen = await transaccionPagoDao.obtenerResumen(empresaId);
            return this.respuestaExito(res, resumen, 'Resumen de transacciones obtenido exitosamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    /**
     * POST /api/pagos/webhook
     * Endpoint receptor público para notificaciones HTTP de pasarelas de pago.
     */
    recibirWebhook = async (req, res) => {
        try {
            const resultado = await pagoService.procesarWebhook(req.body, req.headers);
            return res.status(200).json({ ok: true, ...resultado });
        } catch (error) {
            console.error('[Webhook Pagos Error]:', error);
            return res.status(500).json({ ok: false, error: error.message });
        }
    };
}

export const pagoController = new PagoController();
