import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from './rutas/api.js';
import cookieParser from 'cookie-parser';
import { contextoMiddleware } from './middleware/contextoMiddleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;

const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
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
    app.listen(port, () => {
        console.log(`Servidor corriendo en http://localhost:${port}`);
    });
} else {
    try {
        const cloudflare = await import('cloudflare:node');
        if (cloudflare?.httpServerHandler) {
            handler = cloudflare.httpServerHandler(app);
        }
    } catch {
        // Fallback en entornos donde cloudflare:node no esté disponible
    }
}

export default handler;