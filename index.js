import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from './rutas/api.js';
import cookieParser from 'cookie-parser';
import { contextoMiddleware } from './middleware/contextoMiddleware.js';
import { ventaDao } from './dao/VentaDao.js';

const __filename = import.meta.url ? fileURLToPath(import.meta.url) : '';
const __dirname = __filename ? path.dirname(__filename) : process.cwd();
const app = express();
const port = process.env.PORT || 3000;

const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:5175',
    'http://127.0.0.1:5175',
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // Permitir solicitudes sin origen (Postman/cURL/mobile) o localhost en cualquier puerto durante desarrollo
        const isLocalhost = origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
        if (!origin || allowedOrigins.includes(origin) || isLocalhost) {
            callback(null, true);
        } else {
            callback(new Error(`Bloqueado por CORS: origen ${origin} no permitido`));
        }
    },
    credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir estáticamente carpetas del servidor
app.use('/imagenes', express.static(path.join(__dirname, 'public/imagenes')));
app.use(cookieParser());
app.use(contextoMiddleware);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api', api);

let handler = app;

if (typeof WebSocketPair === 'undefined') {
    const expiracionPagosTimer = setInterval(() => {
        ventaDao.expirarVentasDigitalesPendientes().catch((error) => {
            console.error('No se pudieron expirar las ventas digitales pendientes:', error);
        });
    }, 60_000);
    expiracionPagosTimer.unref?.();

    app.listen(port, () => {
        console.log(`Servidor corriendo en http://localhost:${port}`);
    });
} else {
    // Cloudflare Workers: 'cloudflare:node' solo existe alli, por eso se importa dinamicamente.
    const { httpServerHandler } = await import('cloudflare:node');
    const server = app.listen(port, () => {
        console.log(`Servidor corriendo en http://localhost:${port}`);
    });
    handler = httpServerHandler(server);
}

export default handler;
