import express from 'express';
import { UsuarioController } from '../controller/UsuarioController.js';
import { SeccionController } from '../controller/SeccionController.js';
import { RolController } from '../controller/RolController.js';
import { autenticarUsuario, verificarPermiso } from '../middleware/authMiddleware.js';

const router = express.Router();
const usuarioController = new UsuarioController();
const seccionController = new SeccionController();
const rolController = new RolController();
const usuarioRoutes = express.Router();
const seccionRoutes = express.Router();
const rolRoutes = express.Router();

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

usuarioRoutes.post(
    '/asignarRol',
    autenticarUsuario,
    verificarPermiso('Usuarios', 'Editar'),
    rolController.asignarRol.bind(rolController)
);

usuarioRoutes.delete(
    '/removerRol',
    autenticarUsuario,
    verificarPermiso('Usuarios', 'Editar'),
    rolController.removerRol.bind(rolController)
);

// ── Rutas de secciones ───────────────────────────────────────────────────────
seccionRoutes.get(
    '/mis-secciones',
    autenticarUsuario,
    seccionController.obtenerMisSecciones.bind(seccionController)
);

// ── Rutas de roles ───────────────────────────────────────────────────────────
rolRoutes.get(
    '/',
    autenticarUsuario,
    rolController.obtenerTodos.bind(rolController)
);

router.use('/usuarios', usuarioRoutes);
router.use('/secciones', seccionRoutes);
router.use('/roles', rolRoutes);

export { router as api };