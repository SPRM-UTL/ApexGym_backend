import express from 'express';
import { dispositivoController } from '../controller/DispositivoController.js';
import { autenticarUsuario } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/token', autenticarUsuario, dispositivoController.registrarToken);

export { router as dispositivoRoutes };
