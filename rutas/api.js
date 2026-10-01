import express from 'express';
import { UsuarioController } from '../controller/UsuarioController.js';
import { SeccionController } from '../controller/SeccionController.js';
import { RolController } from '../controller/RolController.js';
import { TipoActividadController } from '../controller/TipoActividadController.js';
import { AreaTrabajoController } from '../controller/AreaTrabajoController.js';
import { ConfiguracionSistemaController } from '../controller/ConfiguracionSistemaController.js';
import { CajaController } from '../controller/CajaController.js';
import { PuestoController } from '../controller/PuestoController.js';
import { EstadoEmpleadoController } from '../controller/EstadoEmpleadoController.js';
import { EmpleadoController } from '../controller/EmpleadoController.js';
import { AperturaCajaController } from '../controller/AperturaCajaController.js';
import { MovimientoCajaController } from '../controller/MovimientoCajaController.js';
import { CorteCajaController } from '../controller/CorteCajaController.js';
import { autenticarUsuario, verificarPermiso } from '../middleware/authMiddleware.js';
import { CategoriaProductoController } from '../controller/CategoriaProductoController.js'

import { uploadFotoUsuario } from '../middleware/uploadMiddleware.js';


const router = express.Router();
const usuarioController = new UsuarioController();
const seccionController = new SeccionController();
const rolController = new RolController();
const tipoActividadController = new TipoActividadController();
const areaTrabajoController = new AreaTrabajoController();
const configuracionSistemaController = new ConfiguracionSistemaController();
const categoriaProductoController = new CategoriaProductoController();
const CategoriaProductoRoutes = express.Router();
const cajaController = new CajaController();
const puestoController = new PuestoController();
const estadoEmpleadoController = new EstadoEmpleadoController();
const empleadoController = new EmpleadoController();
const aperturaCajaController = new AperturaCajaController();
const movimientoCajaController = new MovimientoCajaController();
const corteCajaController = new CorteCajaController();

const usuarioRoutes = express.Router();
const seccionRoutes = express.Router();
const rolRoutes = express.Router();
const tipoActividadRoutes = express.Router();
const areaTrabajoRoutes = express.Router();
const configuracionSistemaRoutes = express.Router();
const cajaRoutes = express.Router();
const puestoRoutes = express.Router();
const estadoEmpleadoRoutes = express.Router();
const empleadoRoutes = express.Router();
const aperturaCajaRoutes = express.Router();
const movimientoCajaRoutes = express.Router();
const corteCajaRoutes = express.Router();

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

// ── Rutas de tipos de actividad ──────────────────────────────────────────────
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

// ── Rutas de áreas de trabajo ────────────────────────────────────────────────
areaTrabajoRoutes.get(
    '/',
    autenticarUsuario,
    verificarPermiso('Áreas de Trabajo', 'Listar'),
    areaTrabajoController.obtenerTodos.bind(areaTrabajoController)
);
areaTrabajoRoutes.get(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Áreas de Trabajo', 'Listar'),
    areaTrabajoController.obtenerPorId.bind(areaTrabajoController)
);
areaTrabajoRoutes.post(
    '/',
    autenticarUsuario,
    verificarPermiso('Áreas de Trabajo', 'Crear'),
    areaTrabajoController.crear.bind(areaTrabajoController)
);
areaTrabajoRoutes.put(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Áreas de Trabajo', 'Editar'),
    areaTrabajoController.actualizar.bind(areaTrabajoController)
);
areaTrabajoRoutes.delete(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Áreas de Trabajo', 'Eliminar'),
    areaTrabajoController.eliminar.bind(areaTrabajoController)
);

// ── Rutas de configuración del sistema ──────────────────────────────────────
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

// ── Rutas de Cajas ───────────────────────────────────────────────────────────
cajaRoutes.get(
    '/',
    autenticarUsuario,
    verificarPermiso('Cajas', 'Listar'),
    cajaController.obtenerTodos.bind(cajaController)
);
cajaRoutes.get(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Cajas', 'Listar'),
    cajaController.obtenerPorId.bind(cajaController)
);
cajaRoutes.post(
    '/',
    autenticarUsuario,
    verificarPermiso('Cajas', 'Crear'),
    cajaController.crear.bind(cajaController)
);
cajaRoutes.put(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Cajas', 'Editar'),
    cajaController.actualizar.bind(cajaController)
);
cajaRoutes.delete(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Cajas', 'Eliminar'),
    cajaController.eliminar.bind(cajaController)
);

// ── Rutas de Puestos ─────────────────────────────────────────────────────────
puestoRoutes.get(
    '/',
    autenticarUsuario,
    verificarPermiso('Puestos', 'Listar'),
    puestoController.obtenerTodos.bind(puestoController)
);
puestoRoutes.get(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Puestos', 'Listar'),
    puestoController.obtenerPorId.bind(puestoController)
);
puestoRoutes.post(
    '/',
    autenticarUsuario,
    verificarPermiso('Puestos', 'Crear'),
    puestoController.crear.bind(puestoController)
);
puestoRoutes.put(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Puestos', 'Editar'),
    puestoController.actualizar.bind(puestoController)
);
puestoRoutes.delete(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Puestos', 'Eliminar'),
    puestoController.eliminar.bind(puestoController)
);

// ── Rutas de Estados de Empleado ─────────────────────────────────────────────
estadoEmpleadoRoutes.get(
    '/',
    autenticarUsuario,
    verificarPermiso('Estados de Empleado', 'Listar'),
    estadoEmpleadoController.obtenerTodos.bind(estadoEmpleadoController)
);
estadoEmpleadoRoutes.get(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Estados de Empleado', 'Listar'),
    estadoEmpleadoController.obtenerPorId.bind(estadoEmpleadoController)
);
estadoEmpleadoRoutes.post(
    '/',
    autenticarUsuario,
    verificarPermiso('Estados de Empleado', 'Crear'),
    estadoEmpleadoController.crear.bind(estadoEmpleadoController)
);
estadoEmpleadoRoutes.put(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Estados de Empleado', 'Editar'),
    estadoEmpleadoController.actualizar.bind(estadoEmpleadoController)
);
estadoEmpleadoRoutes.delete(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Estados de Empleado', 'Eliminar'),
    estadoEmpleadoController.eliminar.bind(estadoEmpleadoController)
);

// ── Rutas de Empleados ───────────────────────────────────────────────────────
empleadoRoutes.get(
    '/',
    autenticarUsuario,
    verificarPermiso('Empleados', 'Listar'),
    empleadoController.obtenerTodos.bind(empleadoController)
);
empleadoRoutes.get(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Empleados', 'Listar'),
    empleadoController.obtenerPorId.bind(empleadoController)
);
empleadoRoutes.post(
    '/',
    autenticarUsuario,
    verificarPermiso('Empleados', 'Crear'),
    empleadoController.crear.bind(empleadoController)
);
empleadoRoutes.put(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Empleados', 'Editar'),
    empleadoController.actualizar.bind(empleadoController)
);
empleadoRoutes.delete(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Empleados', 'Eliminar'),
    empleadoController.eliminar.bind(empleadoController)
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

// ── Rutas de Apertura de Caja ────────────────────────────────────────────────
aperturaCajaRoutes.get(
    '/',
    autenticarUsuario,
    verificarPermiso('Apertura de Caja', 'Listar'),
    aperturaCajaController.obtenerTodos.bind(aperturaCajaController)
);
aperturaCajaRoutes.get(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Apertura de Caja', 'Listar'),
    aperturaCajaController.obtenerPorId.bind(aperturaCajaController)
);
aperturaCajaRoutes.post(
    '/',
    autenticarUsuario,
    verificarPermiso('Apertura de Caja', 'Crear'),
    aperturaCajaController.crear.bind(aperturaCajaController)
);
aperturaCajaRoutes.put(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Apertura de Caja', 'Editar'),
    aperturaCajaController.actualizar.bind(aperturaCajaController)
);
aperturaCajaRoutes.delete(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Apertura de Caja', 'Eliminar'),
    aperturaCajaController.eliminar.bind(aperturaCajaController)
);
aperturaCajaRoutes.post(
    '/:id/cerrar',
    autenticarUsuario,
    verificarPermiso('Apertura de Caja', 'Editar'),
    aperturaCajaController.cerrar.bind(aperturaCajaController)
);

// ── Rutas de Movimientos de Caja ─────────────────────────────────────────────
movimientoCajaRoutes.get(
    '/',
    autenticarUsuario,
    verificarPermiso('Movimientos de Caja', 'Listar'),
    movimientoCajaController.obtenerTodos.bind(movimientoCajaController)
);
movimientoCajaRoutes.get(
    '/apertura/:aperturaCajaId',
    autenticarUsuario,
    verificarPermiso('Movimientos de Caja', 'Listar'),
    movimientoCajaController.obtenerPorApertura.bind(movimientoCajaController)
);
movimientoCajaRoutes.get(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Movimientos de Caja', 'Listar'),
    movimientoCajaController.obtenerPorId.bind(movimientoCajaController)
);
movimientoCajaRoutes.post(
    '/',
    autenticarUsuario,
    verificarPermiso('Movimientos de Caja', 'Crear'),
    movimientoCajaController.crear.bind(movimientoCajaController)
);
movimientoCajaRoutes.delete(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Movimientos de Caja', 'Eliminar'),
    movimientoCajaController.eliminar.bind(movimientoCajaController)
);

// ── Rutas de Corte de Caja ───────────────────────────────────────────────────
corteCajaRoutes.get(
    '/',
    autenticarUsuario,
    verificarPermiso('Corte de Caja', 'Listar'),
    corteCajaController.obtenerTodos.bind(corteCajaController)
);
corteCajaRoutes.get(
    '/apertura/:aperturaCajaId',
    autenticarUsuario,
    verificarPermiso('Corte de Caja', 'Listar'),
    corteCajaController.obtenerPorApertura.bind(corteCajaController)
);
corteCajaRoutes.get(
    '/:id',
    autenticarUsuario,
    verificarPermiso('Corte de Caja', 'Listar'),
    corteCajaController.obtenerPorId.bind(corteCajaController)
);
corteCajaRoutes.post(
    '/',
    autenticarUsuario,
    verificarPermiso('Corte de Caja', 'Crear'),
    corteCajaController.crear.bind(corteCajaController)
);

router.use('/usuarios', usuarioRoutes);
router.use('/secciones', seccionRoutes);
router.use('/roles', rolRoutes);
router.use('/tipos-actividad', tipoActividadRoutes);
router.use('/areas-trabajo', areaTrabajoRoutes);
router.use('/configuraciones-sistema', configuracionSistemaRoutes);
router.use('/cajas', cajaRoutes);
router.use('/puestos', puestoRoutes);
router.use('/estados-empleado', estadoEmpleadoRoutes);
router.use('/categorias-productos', CategoriaProductoRoutes);
router.use('/aperturas-caja', aperturaCajaRoutes);
router.use('/movimientos-caja', movimientoCajaRoutes);
router.use('/cortes-caja', corteCajaRoutes);
router.use('/empleados', empleadoRoutes);

export { router as api };
