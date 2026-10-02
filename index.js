import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from './rutas/api.js';
import cookieParser from 'cookie-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

app.use(cors({
    /**Esta nos permite comunicarnos con el frontend  */
    origin: process.env.FRONTEND_URL, credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir estáticamente carpetas del servidor
app.use('/imagenes', express.static(path.join(__dirname, 'public/imagenes')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api', api);

app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});