import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from './rutas/api.js';

import cors from 'cors';
import cookieParser from 'cookie-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = 3000;



app.use(cors({
    /**Esta nos permite comunicarnos con el frontend  */
    origin: process.env.FRONTEND_URL, credentials: true
}));
app.use(express.json());
//de esta manera convertimos un header en una propiedad de objeto
app.use(cookieParser())
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api', api);

app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});
