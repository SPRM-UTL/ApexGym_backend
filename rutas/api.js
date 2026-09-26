import express from 'express';
import { UsuarioController } from '../controller/UsuarioController.js';
import { autenticarUsuario } from '../middleware/authMiddleware.js';

const router = express.Router();
const usuarioController = new UsuarioController();
const usuarioRoutes = express.Router();

// Públicas
usuarioRoutes.post('/registrarUsuario', usuarioController.registrarUsuario.bind(usuarioController));
usuarioRoutes.put('/actualizarUsuario', usuarioController.actualizarUsuario.bind(usuarioController));
usuarioRoutes.delete('/eliminarUsuario', usuarioController.eliminarUsuario.bind(usuarioController));
usuarioRoutes.post('/verificarCredenciales', usuarioController.verificarCredenciales.bind(usuarioController));

// Protegidas
usuarioRoutes.get(
    '/',
    autenticarUsuario,
    usuarioController.obtenerTodos.bind(usuarioController)
);

router.use('/usuarios', usuarioRoutes);

export { router as api };