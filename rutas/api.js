import express from 'express';
import { UsuarioController } from '../controller/UsuarioController.js';
import { SeccionController } from '../controller/SeccionController.js';
import { RolController } from '../controller/RolController.js';
import { TipoActividadController } from '../controller/TipoActividadController.js';
import { AreaTrabajoController } from '../controller/AreaTrabajoController.js';
import { ConfiguracionSistemaController } from '../controller/ConfiguracionSistemaController.js';
import { autenticarUsuario, verificarPermiso } from '../middleware/authMiddleware.js';
import { CategoriaProductoController } from '../controller/CategoriaProductoController.js';
import { EstadoClienteController } from '../controller/EstadoClienteController.js';
import { ClienteController } from '../controller/ClienteController.js';
import { EstadoMembresiaController } from '../controller/EstadoMembresiaController.js';
import { TipoMembresiaController } from '../controller/TipoMembresiaController.js';
import { TipoVisitaController } from '../controller/TipoVisitaController.js';

import { uploadFotoUsuario } from '../middleware/uploadMiddleware.js';


const router = express.Router();
const usuarioController = new UsuarioController();
const seccionController = new SeccionController();
const rolController = new RolController();
const tipoActividadController = new TipoActividadController();
const areaTrabajoController = new AreaTrabajoController();
const configuracionSistemaController = new ConfiguracionSistemaController();
const categoriaProductoController = new CategoriaProductoController();
const estadoClienteController = new EstadoClienteController();
const clienteController = new ClienteController();
const estadoMembresiaController = new EstadoMembresiaController();
const tipoMembresiaController = new TipoMembresiaController();
const tipoVisitaController = new TipoVisitaController();

const CategoriaProductoRoutes = express.Router();
const estadoClienteRoutes = express.Router();
const clienteRoutes = express.Router();
const estadoMembresiaRoutes = express.Router();
const tipoMembresiaRoutes = express.Router();
const tipoVisitaRoutes = express.Router();
const usuarioRoutes = express.Router();
const seccionRoutes = express.Router();
const rolRoutes = express.Router();
const tipoActividadRoutes = express.Router();
const areaTrabajoRoutes = express.Router();
const configuracionSistemaRoutes = express.Router();

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
    uploadFotoUsuario,
    usuarioController.registrarUsuario.bind(usuarioController)
);

usuarioRoutes.put(
    '/actualizarUsuario',
    autenticarUsuario,
    verificarPermiso('Usuarios', 'Editar'),
    uploadFotoUsuario,
    usuarioController.actualizarUsuario.bind(usuarioController)
);

usuarioRoutes.delete(
    '/eliminarUsuario',
    autenticarUsuario,
    verificarPermiso('Usuarios', 'Eliminar'),
    usuarioController.eliminarUsuario.bind(usuarioController)
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

rolRoutes.get(
    '/permisos',
    autenticarUsuario,
    verificarPermiso('Administración de roles', 'Listar'),
    rolController.obtenerPermisos.bind(rolController)
);

rolRoutes.post(
    '/',
    autenticarUsuario,
    verificarPermiso('Administración de roles', 'Crear'),
    rolController.crear.bind(rolController)
);

rolRoutes.put(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Administración de roles', 'Editar'),
    rolController.actualizar.bind(rolController)
);

rolRoutes.delete(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Administración de roles', 'Eliminar'),
    rolController.eliminar.bind(rolController)
);

tipoActividadRoutes.get(
    '/',
    autenticarUsuario,
    verificarPermiso('Tipos de Actividad', 'Listar'),
    tipoActividadController.obtenerTodos.bind(tipoActividadController)
);
tipoActividadRoutes.post(
    '/',
    autenticarUsuario,
    verificarPermiso('Tipos de Actividad', 'Crear'),
    tipoActividadController.crear.bind(tipoActividadController)
);
tipoActividadRoutes.put(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Tipos de Actividad', 'Editar'),
    tipoActividadController.actualizar.bind(tipoActividadController)
);
tipoActividadRoutes.delete(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Tipos de Actividad', 'Eliminar'),
    tipoActividadController.eliminar.bind(tipoActividadController)
);

areaTrabajoRoutes.get(
    '/',
    autenticarUsuario,
    verificarPermiso('Tipos de Actividad', 'Listar'),
    areaTrabajoController.obtenerTodos.bind(areaTrabajoController)
);

configuracionSistemaRoutes.get(
    '/',
    autenticarUsuario,
    verificarPermiso('Configuración del Sistema', 'Listar'),
    configuracionSistemaController.obtenerTodos.bind(configuracionSistemaController)
);
configuracionSistemaRoutes.post(
    '/',
    autenticarUsuario,
    verificarPermiso('Configuración del Sistema', 'Crear'),
    configuracionSistemaController.crear.bind(configuracionSistemaController)
);
configuracionSistemaRoutes.put(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Configuración del Sistema', 'Editar'),
    configuracionSistemaController.actualizar.bind(configuracionSistemaController)
);
configuracionSistemaRoutes.delete(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Configuración del Sistema', 'Eliminar'),
    configuracionSistemaController.eliminar.bind(configuracionSistemaController)
);

// ── Rutas de Categorías de Productos ───────────────────────────────────────
CategoriaProductoRoutes.get(
    '/',
    autenticarUsuario,
    verificarPermiso('Categorías de Productos', 'Listar'),
    categoriaProductoController.obtenerTodos.bind(categoriaProductoController)
);

CategoriaProductoRoutes.post(
    '/',
    autenticarUsuario,
    verificarPermiso('Categorías de Productos', 'Crear'),
    categoriaProductoController.crear.bind(categoriaProductoController)
);

CategoriaProductoRoutes.put(
    '/',
    autenticarUsuario,
    verificarPermiso('Categorías de Productos', 'Editar'),
    categoriaProductoController.actualizar.bind(categoriaProductoController)
);

CategoriaProductoRoutes.delete(
    '/',
    autenticarUsuario,
    verificarPermiso('Categorías de Productos', 'Eliminar'),
    categoriaProductoController.eliminar.bind(categoriaProductoController)
);


// ── Rutas de Estados de Cliente ──────────────────────────────────────────────
estadoClienteRoutes.get(
    '/',
    autenticarUsuario,
    verificarPermiso('Estados de Cliente', 'Listar'),
    estadoClienteController.obtenerTodos.bind(estadoClienteController)
);

estadoClienteRoutes.post(
    '/',
    autenticarUsuario,
    verificarPermiso('Estados de Cliente', 'Crear'),
    estadoClienteController.crear.bind(estadoClienteController)
);

estadoClienteRoutes.put(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Estados de Cliente', 'Editar'),
    estadoClienteController.actualizar.bind(estadoClienteController)
);

estadoClienteRoutes.delete(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Estados de Cliente', 'Eliminar'),
    estadoClienteController.eliminar.bind(estadoClienteController)
);

// ── Rutas de Clientes ────────────────────────────────────────────────────────
clienteRoutes.get(
    '/',
    autenticarUsuario,
    verificarPermiso('Clientes', 'Listar'),
    clienteController.obtenerTodos.bind(clienteController)
);
clienteRoutes.post(
    '/',
    autenticarUsuario,
    verificarPermiso('Clientes', 'Crear'),
    clienteController.crear.bind(clienteController)
);
clienteRoutes.put(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Clientes', 'Editar'),
    clienteController.actualizar.bind(clienteController)
);
clienteRoutes.delete(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Clientes', 'Eliminar'),
    clienteController.eliminar.bind(clienteController)
);

// ── Rutas de Estados de Membresía ────────────────────────────────────────────
estadoMembresiaRoutes.get(
    '/',
    autenticarUsuario,
    verificarPermiso('Estados de Membresía', 'Listar'),
    estadoMembresiaController.obtenerTodos.bind(estadoMembresiaController)
);
estadoMembresiaRoutes.post(
    '/',
    autenticarUsuario,
    verificarPermiso('Estados de Membresía', 'Crear'),
    estadoMembresiaController.crear.bind(estadoMembresiaController)
);
estadoMembresiaRoutes.put(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Estados de Membresía', 'Editar'),
    estadoMembresiaController.actualizar.bind(estadoMembresiaController)
);
estadoMembresiaRoutes.delete(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Estados de Membresía', 'Eliminar'),
    estadoMembresiaController.eliminar.bind(estadoMembresiaController)
);

// ── Rutas de Tipos de Membresía ──────────────────────────────────────────────
tipoMembresiaRoutes.get(
    '/',
    autenticarUsuario,
    verificarPermiso('Tipos de Membresía', 'Listar'),
    tipoMembresiaController.obtenerTodos.bind(tipoMembresiaController)
);
tipoMembresiaRoutes.post(
    '/',
    autenticarUsuario,
    verificarPermiso('Tipos de Membresía', 'Crear'),
    tipoMembresiaController.crear.bind(tipoMembresiaController)
);
tipoMembresiaRoutes.put(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Tipos de Membresía', 'Editar'),
    tipoMembresiaController.actualizar.bind(tipoMembresiaController)
);
tipoMembresiaRoutes.delete(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Tipos de Membresía', 'Eliminar'),
    tipoMembresiaController.eliminar.bind(tipoMembresiaController)
);

// ── Rutas de Tipos de Visita ─────────────────────────────────────────────────
tipoVisitaRoutes.get(
    '/',
    autenticarUsuario,
    verificarPermiso('Tipos de Visita', 'Listar'),
    tipoVisitaController.obtenerTodos.bind(tipoVisitaController)
);
tipoVisitaRoutes.post(
    '/',
    autenticarUsuario,
    verificarPermiso('Tipos de Visita', 'Crear'),
    tipoVisitaController.crear.bind(tipoVisitaController)
);
tipoVisitaRoutes.put(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Tipos de Visita', 'Editar'),
    tipoVisitaController.actualizar.bind(tipoVisitaController)
);
tipoVisitaRoutes.delete(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Tipos de Visita', 'Eliminar'),
    tipoVisitaController.eliminar.bind(tipoVisitaController)
);

router.use('/categorias-productos', CategoriaProductoRoutes);
router.use('/estados-cliente', estadoClienteRoutes);
router.use('/clientes', clienteRoutes);
router.use('/estados-membresia', estadoMembresiaRoutes);
router.use('/tipos-membresia', tipoMembresiaRoutes);
router.use('/tipos-visita', tipoVisitaRoutes);
router.use('/usuarios', usuarioRoutes);
router.use('/secciones', seccionRoutes);
router.use('/roles', rolRoutes);
router.use('/tipos-actividad', tipoActividadRoutes);
router.use('/areas-trabajo', areaTrabajoRoutes);
router.use('/configuraciones-sistema', configuracionSistemaRoutes);

export { router as api };
