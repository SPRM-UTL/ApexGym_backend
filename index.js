import 'dotenv/config';
import express from 'express';
import { api } from './rutas/api.js';

import cors from 'cors';

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use('/api', api);

app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});
