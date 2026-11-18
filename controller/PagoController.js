import { pagoService } from '../services/PagoService.js';

export class PagoController {
    recibirWebhook = async (req, res) => {
        try {
            const resultado = await pagoService.procesarWebhook(req.query, req.body, req.headers);
            return res.status(200).json({ ok: true, ...resultado });
        } catch (error) {
            if ([400, 401, 404, 409, 502, 503].includes(error.status)) {
                return res.status(error.status).json({ ok: false, error: error.message });
            }
            console.error('[Webhook Pagos Error]:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo procesar la notificación de pago.' });
        }
    };
}

export const pagoController = new PagoController();
