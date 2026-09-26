import express from 'express';
import { UsuarioController } from '../controller/UsuarioController.js';
import { autenticarUsuario, verificarPermiso } from '../middleware/authMiddleware.js';

const router = express.Router();
const usuarioController = new UsuarioController();
const usuarioRoutes = express.Router();

// ── Rutas públicas (sin autenticación) ──────────────────────────────────────
usuarioRoutes.post('/verificarCredenciales', usuarioController.verificarCredenciales.bind(usuarioController));

// ── Rutas protegidas (autenticación + permiso específico) ───────────────────
usuarioRoutes.get(
    '/',
    autenticarUsuario,
    verificarPermiso('Usuarios', 'Listar'),
    usuarioController.obtenerTodos.bind(usuarioController)
);

usuarioRoutes.post(
    '/registrarUsuario',
    autenticarUsuario,
    verificarPermiso('Usuarios', 'Crear'),
    usuarioController.registrarUsuario.bind(usuarioController)
);

usuarioRoutes.put(
    '/actualizarUsuario',
    autenticarUsuario,
    verificarPermiso('Usuarios', 'Editar'),
    usuarioController.actualizarUsuario.bind(usuarioController)
);

usuarioRoutes.delete(
    '/eliminarUsuario',
    autenticarUsuario,
    verificarPermiso('Usuarios', 'Eliminar'),
    usuarioController.eliminarUsuario.bind(usuarioController)
);

router.use('/usuarios', usuarioRoutes);

export { router as api };