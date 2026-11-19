/**
 * Registro declarativo de endpoints a probar.
 * Para escalar solo agrega una linea al arreglo correspondiente.
 *
 *  { nombre, metodo, ruta, esperado }
 *  - esperado: codigo HTTP esperado (por defecto 200).
 *  - Solo se incluyen lecturas (GET) para no alterar la BD.
 */

// Rutas publicas (no requieren token)
export const publicos = [
    { nombre: 'Login con credenciales invalidas', metodo: 'POST', ruta: '/api/usuarios/login-movil',
      body: { email: 'no-existe@apexgym.com', contrasenia: 'incorrecta' }, esperado: 401 },
];

// Rutas protegidas de solo lectura: se prueban con token (200) y sin token (401)
export const protegidos = [
    '/api/usuarios',
    '/api/roles',
    '/api/secciones/mis-secciones',
    '/api/empleados',
    '/api/puestos',
    '/api/estados-empleado',
    '/api/areas-trabajo',
    '/api/tipos-actividad',
    '/api/configuraciones-sistema',
    '/api/sucursales',
    '/api/empresa',
    '/api/clientes',
    '/api/estados-cliente',
    '/api/clientes-membresias',
    '/api/estados-membresia',
    '/api/tipos-membresia',
    '/api/tipos-visita',
    '/api/productos',
    '/api/categorias-productos',
    '/api/servicios',
    '/api/metodos-pago',
    '/api/cajas',
    '/api/aperturas-caja',
    '/api/movimientos-caja',
    '/api/cortes-caja',
    '/api/ventas',
].map((ruta) => ({ nombre: `GET ${ruta}`, metodo: 'GET', ruta, esperado: 200 }));

