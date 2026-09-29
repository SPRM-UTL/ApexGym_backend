import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from './rutas/api.js';

import cors from 'cors';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api', api);

app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});
