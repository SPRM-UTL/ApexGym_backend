import express from 'express';
import { UsuarioController } from '../controller/UsuarioController.js';

const router = express.Router();
const usuarioController = new UsuarioController();
const usuarioRoutes = express.Router();

usuarioRoutes.get('/', usuarioController.obtenerTodos.bind(usuarioController));
usuarioRoutes.post('/registrarUsuario', usuarioController.registrarUsuario.bind(usuarioController));
usuarioRoutes.put('/actualizarUsuario', usuarioController.actualizarUsuario.bind(usuarioController));
usuarioRoutes.delete('/eliminarUsuario', usuarioController.eliminarUsuario.bind(usuarioController));
usuarioRoutes.post('/verificarCredenciales', usuarioController.verificarCredenciales.bind(usuarioController));
router.use('/usuarios', usuarioRoutes);

export { router as api };