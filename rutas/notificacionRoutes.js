import express from 'express';
import { notificacionController } from '../controller/NotificacionController.js';
import { autenticarUsuario, verificarEmpleado } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', autenticarUsuario, verificarEmpleado, notificacionController.crear);
router.get('/', autenticarUsuario, notificacionController.obtenerTodos);
router.get('/stream', autenticarUsuario, notificacionController.stream);
router.get('/no-leidas/count', autenticarUsuario, notificacionController.contarNoLeidas);
router.patch('/leer-todas', autenticarUsuario, notificacionController.marcarTodasLeidas);
router.patch('/:id/leida', autenticarUsuario, notificacionController.cambiarEstado('LEIDA'));
router.patch('/:id/ignorada', autenticarUsuario, notificacionController.cambiarEstado('IGNORADA'));

export { router as notificacionRoutes };
