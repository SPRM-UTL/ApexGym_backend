/**
 * Seed declarativo de secciones, módulos, permisos, roles
 * y registros de ejemplo para pruebas.
 * Los datos editables viven en ./seed-data.json.
 *
 * Ejecución: npx prisma db seed / npm run seed
 */

import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import mariadb from 'mariadb';
import 'dotenv/config';
import seedData from './seed-data.json' with { type: 'json' };
import { encriptarContrasena } from '../utilidades/utilesSeguridad.js';

const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    allowPublicKeyRetrieval: true,
});

const adapter = new PrismaMariaDb(pool);
const prisma = new PrismaClient({ adapter });

const upsertEmpresaDefault = async () => {
    const empresa = await prisma.empresa.upsert({
        where: { id: 1 },
        update: {
            deletedAt: null,
        },
        create: {
            id: 1,
            nombreComercial: 'ApexGym',
            razonSocial: 'ApexGym S.A. de C.V.',
            rfc: 'APX260101AAA',
            telefono: '555-019-2834',
            email: 'contacto@apexgym.com',
            direccion: 'Av. Principal #100, Col. Centro',
            ciudad: 'Ciudad de México',
            estado: 'CDMX',
            codigoPostal: '06000',
            logoUrl: null,
            colorPrimario: '#FF6A00',
            moneda: 'MXN',
            simboloMoneda: '$',
            zonaHoraria: 'America/Mexico_City',
            toleranciaMinutos: 15,
            mensajeTicket: '¡Gracias por entrenar en ApexGym!',
            activo: true,
        },
    });

    console.log(`Empresa por defecto asegurada: [id=${empresa.id}] ${empresa.nombreComercial}`);
    return empresa;
};

const upsertSeccion = (seccion) => prisma.seccion.upsert({
    where: { nombre: seccion.nombre },
    update: {
        descripcion: seccion.descripcion,
        orden: seccion.orden ?? 0,
        imagenUrl: seccion.imagenUrl,
        imagenPublicId: seccion.imagenPublicId,
        deletedAt: null,
    },
    create: {
        nombre: seccion.nombre,
        descripcion: seccion.descripcion,
        orden: seccion.orden ?? 0,
        imagenUrl: seccion.imagenUrl,
        imagenPublicId: seccion.imagenPublicId,
    },
});

const upsertModulo = async (seccionId, modulo) => {
    const existente = await prisma.modulo.findFirst({
        where: { nombre: modulo.nombre },
    });

    if (existente) {
        return prisma.modulo.update({
            where: { id: existente.id },
            data: {
                seccionId,
                descripcion: modulo.descripcion,
                orden: modulo.orden ?? 0,
                imagenUrl: modulo.imagenUrl,
                imagenPublicId: modulo.imagenPublicId,
                deletedAt: null,
            },
        });
    }

    return prisma.modulo.create({
        data: {
            seccionId,
            nombre: modulo.nombre,
            descripcion: modulo.descripcion,
            orden: modulo.orden ?? 0,
            imagenUrl: modulo.imagenUrl,
            imagenPublicId: modulo.imagenPublicId,
        },
    });
};

const upsertAccion = (accion) => prisma.accion.upsert({
    where: { nombre: accion.nombre },
    update: { descripcion: accion.descripcion, deletedAt: null },
    create: {
        nombre: accion.nombre,
        descripcion: accion.descripcion,
    },
});

const upsertPermiso = (moduloId, accionId, metodo, descripcion) => prisma.permiso.upsert({
    where: { permiso_unico: { moduloId, accionId, metodo } },
    update: { descripcion, deletedAt: null },
    create: { moduloId, accionId, metodo, descripcion },
});

const upsertRol = (rol) => prisma.rol.upsert({
    where: { nombre: rol.nombre },
    update: { descripcion: rol.descripcion, empresaId: 1, deletedAt: null },
    create: { nombre: rol.nombre, descripcion: rol.descripcion, empresaId: 1 },
});

// Función para insertar/actualizar usuarios desde el JSON
const upsertUsuario = async (usuario) => {
    const plainPassword = usuario.password || usuario.contrasenia;
    const hashedPassword = encriptarContrasena(plainPassword);

    return prisma.usuario.upsert({
        where: { email: usuario.email },
        update: {
            nombre: usuario.nombre,
            contrasenia: hashedPassword,
            empresaId: 1,
            deletedAt: null,
        },
        create: {
            nombre: usuario.nombre,
            email: usuario.email,
            contrasenia: hashedPassword,
            empresaId: 1,
        },
    });
};

async function sincronizarPermisosRol(rolId, permisosIds) {
    const ids = [...new Set(permisosIds)];
    const existentes = await prisma.rolPermiso.findMany({ where: { rolId } });

    for (const permisoId of ids) {
        await prisma.rolPermiso.upsert({
            where: { rolId_permisoId: { rolId, permisoId } },
            update: { deletedAt: null },
            create: { rolId, permisoId },
        });
    }

    for (const existente of existentes) {
        if (!ids.includes(existente.permisoId)) {
            await prisma.rolPermiso.update({
                where: { rolId_permisoId: { rolId, permisoId: existente.permisoId } },
                data: { deletedAt: new Date() },
            });
        }
    }
}

async function asignarRolAlPrimerUsuario(rolId) {
    const usuario = await prisma.usuario.findFirst({
        where: { deletedAt: null },
        orderBy: { id: 'asc' },
        select: { id: true, nombre: true, email: true },
    });

    if (!usuario) {
        console.warn('No hay usuarios activos para asignar el rol Administrador.');
        return;
    }

    await prisma.usuarioRol.upsert({
        where: { usuarioId_rolId: { usuarioId: usuario.id, rolId } },
        update: { deletedAt: null },
        create: { usuarioId: usuario.id, rolId },
    });

    console.log(`Rol asignado a ${usuario.nombre} <${usuario.email}>.`);
}

async function crearUsuarioDefault() {
    const email = 'apexgym@sprm.com.mx';
    const contraseniaPlana = 'sprm-2026';
    const contrasenia = encriptarContrasena(contraseniaPlana);

    const usuario = await prisma.usuario.upsert({
        where: { email },
        update: {
            contrasenia,
            empresaId: 1,
            deletedAt: null,
        },
        create: {
            nombre: 'Administrador ApexGym',
            email,
            contrasenia,
            empresaId: 1,
        },
    });

    console.log(`Usuario por defecto creado/actualizado: ${usuario.nombre} <${usuario.email}>`);
    return usuario;
}

const dia = (iso) => new Date(`${iso}T00:00:00.000Z`);
const marcaEjemplo = (clave) => `[Ejemplo:${clave}]`;

async function guardar(modelo, where, data) {
    const existente = await prisma[modelo].findFirst({ where });
    if (existente) {
        return prisma[modelo].update({
            where: { id: existente.id },
            data: { ...data, deletedAt: null },
        });
    }
    return prisma[modelo].create({ data });
}

function tomar(item, campos) {
    const data = {};
    for (const campo of campos) {
        if (item[campo] !== undefined) data[campo] = item[campo];
    }
    return data;
}

function exigir(mapa, nombre, catalogo) {
    const registro = mapa.get(nombre);
    if (!registro) {
        throw new Error(`El ejemplo referencia "${nombre}" y no existe en ${catalogo}.`);
    }
    return registro;
}

async function sembrarCatalogo(modelo, items, campos) {
    const mapa = new Map();
    for (const item of items ?? []) {
        const registro = await guardar(modelo, { nombre: item.nombre }, tomar(item, campos));
        mapa.set(item.nombre, registro);
    }
    return mapa;
}

async function sembrarEjemplos(ejemplos) {
    if (!ejemplos) return;

    const estadosCliente = await sembrarCatalogo('estadoCliente', ejemplos.estadosCliente, ['nombre', 'descripcion', 'color']);
    const estadosMembresia = await sembrarCatalogo('estadoMembresia', ejemplos.estadosMembresia, ['nombre', 'descripcion', 'color']);
    const tiposMembresia = await sembrarCatalogo('tipoMembresia', ejemplos.tiposMembresia, ['nombre', 'descripcion', 'duracionDias', 'precio', 'estado']);
    const tiposVisita = await sembrarCatalogo('tipoVisita', ejemplos.tiposVisita, ['nombre', 'descripcion', 'costo', 'estado']);
    const estadosEmpleado = await sembrarCatalogo('estadoEmpleado', ejemplos.estadosEmpleado, ['nombre', 'descripcion']);
    const areas = await sembrarCatalogo('areaTrabajo', ejemplos.areasTrabajo, ['nombre', 'descripcion', 'estado']);
    const cajas = await sembrarCatalogo('caja', ejemplos.cajas, ['nombre', 'ubicacion', 'estado']);

    const categorias = new Map();
    for (const item of ejemplos.categoriasProducto ?? []) {
        const registro = await prisma.categoriaProducto.upsert({
            where: { nombre: item.nombre },
            update: { ...tomar(item, ['descripcion', 'estado']), deletedAt: null },
            create: tomar(item, ['nombre', 'descripcion', 'estado']),
        });
        categorias.set(item.nombre, registro);
    }

    for (const item of ejemplos.productos ?? []) {
        const categoria = exigir(categorias, item.categoria, 'categorías de producto');
        const data = {
            ...tomar(item, ['nombre', 'descripcion', 'precioVenta', 'precioCompra', 'stockActual', 'stockMinimo', 'estado', 'disponibleCompra']),
            categoriaProductoId: categoria.id,
        };
        await prisma.producto.upsert({
            where: { codigoBarras: item.codigoBarras },
            update: { ...data, deletedAt: null },
            create: { ...data, codigoBarras: item.codigoBarras },
        });
    }

    for (const item of ejemplos.metodosPago ?? []) {
        const data = tomar(item, ['descripcion', 'estado']);
        await prisma.metodoPago.upsert({
            where: { nombre: item.nombre },
            update: { ...data, deletedAt: null },
            create: { nombre: item.nombre, ...data },
        });
    }

    for (const item of ejemplos.servicios ?? []) {
        const data = tomar(item, ['descripcion', 'precio', 'estado', 'disponibleCompra']);
        await prisma.servicio.upsert({
            where: { nombre: item.nombre },
            update: { ...data, deletedAt: null },
            create: { nombre: item.nombre, ...data },
        });
    }

    const puestos = new Map();
    for (const item of ejemplos.puestos ?? []) {
        const area = exigir(areas, item.area, 'áreas de trabajo');
        const registro = await guardar('puesto', { nombre: item.nombre, areaTrabajoId: area.id }, {
            areaTrabajoId: area.id,
            ...tomar(item, ['nombre', 'descripcion', 'salarioBase', 'estado']),
        });
        puestos.set(`${item.area}::${item.nombre}`, registro);
    }

    const empleados = new Map();
    for (const item of ejemplos.empleados ?? []) {
        const puesto = exigir(puestos, `${item.area}::${item.puesto}`, 'puestos');
        const area = exigir(areas, item.area, 'áreas de trabajo');
        const estado = exigir(estadosEmpleado, item.estado, 'estados de empleado');
        const usuario = item.usuarioEmail
            ? await prisma.usuario.findUnique({ where: { email: item.usuarioEmail } })
            : null;
        const registro = await guardar('empleado', { correo: item.correo }, {
            puestoId: puesto.id,
            areaTrabajoId: area.id,
            estadoEmpleadoId: estado.id,
            usuarioId: usuario?.id ?? null,
            ...tomar(item, ['nombre', 'apellidoPaterno', 'apellidoMaterno', 'telefono', 'correo', 'direccion']),
            fechaNacimiento: dia(item.fechaNacimiento),
            fechaIngreso: dia(item.fechaIngreso),
        });
        empleados.set(item.correo, registro);
    }

    for (const item of ejemplos.tiposActividad ?? []) {
        const area = item.area ? exigir(areas, item.area, 'áreas de trabajo') : null;
        await guardar('tipoActividad', { nombre: item.nombre }, {
            areaTrabajoId: area?.id ?? null,
            ...tomar(item, ['nombre', 'descripcion', 'estado']),
        });
    }

    for (const item of ejemplos.clientes ?? []) {
        const estado = exigir(estadosCliente, item.estado, 'estados de cliente');
        const usuario = item.usuarioEmail
            ? await prisma.usuario.findUnique({ where: { email: item.usuarioEmail } })
            : null;
        const cliente = await guardar('cliente', { correo: item.correo }, {
            estadoClienteId: estado.id,
            usuarioId: usuario?.id ?? null,
            ...tomar(item, [
                'nombre', 'apellidoPaterno', 'apellidoMaterno', 'genero', 'telefono', 'correo',
                'direccion', 'contactoEmergenciaNombre', 'contactoEmergenciaTelefono',
            ]),
            fechaNacimiento: dia(item.fechaNacimiento),
            fechaRegistro: dia(item.fechaRegistro),
        });

        let membresia = null;
        if (item.membresia) {
            const tipo = exigir(tiposMembresia, item.membresia.tipo, 'tipos de membresía');
            const estadoMembresia = exigir(estadosMembresia, item.membresia.estado, 'estados de membresía');
            const fechaInicio = dia(item.membresia.fechaInicio);
            membresia = await guardar('clienteMembresia', {
                clienteId: cliente.id,
                tipoMembresiaId: tipo.id,
                fechaInicio,
            }, {
                clienteId: cliente.id,
                tipoMembresiaId: tipo.id,
                estadoMembresiaId: estadoMembresia.id,
                fechaInicio,
                fechaFin: dia(item.membresia.fechaFin),
                renovacionAutomatica: item.membresia.renovacionAutomatica ?? false,
            });
        }

        for (const asistencia of item.asistencias ?? []) {
            const nota = marcaEjemplo(asistencia.clave);
            await guardar('asistencia', { observaciones: { startsWith: nota } }, {
                clienteId: cliente.id,
                clienteMembresiaId: membresia?.id ?? null,
                fechaHora: new Date(asistencia.fechaHora),
                observaciones: `${nota} ${asistencia.observaciones ?? ''}`.trim(),
            });
        }
    }

    for (const item of ejemplos.visitas ?? []) {
        const tipo = exigir(tiposVisita, item.tipo, 'tipos de visita');
        const nota = marcaEjemplo(item.clave);
        await guardar('visita', { observaciones: { startsWith: nota } }, {
            nombreVisitante: item.nombreVisitante,
            tipoVisitaId: tipo.id,
            costo: item.costo,
            fechaHora: new Date(item.fechaHora),
            observaciones: `${nota} ${item.observaciones ?? ''}`.trim(),
        });
    }

    for (const item of ejemplos.aperturasCaja ?? []) {
        const caja = exigir(cajas, item.caja, 'cajas');
        const empleado = exigir(empleados, item.empleadoCorreo, 'empleados');
        const nota = marcaEjemplo(item.clave);
        let apertura = await prisma.aperturaCaja.findFirst({
            where: { observaciones: { startsWith: nota } },
        });

        let estado = item.estado;
        if (estado === 'ABIERTA') {
            const otraAbierta = await prisma.aperturaCaja.findFirst({
                where: {
                    cajaId: caja.id,
                    estado: 'ABIERTA',
                    deletedAt: null,
                    ...(apertura ? { id: { not: apertura.id } } : {}),
                },
            });
            if (otraAbierta && !apertura) {
                console.warn(`Se omite ${item.clave}: ${item.caja} ya tiene una sesión abierta.`);
                continue;
            }
            if (otraAbierta && apertura) {
                console.warn(`No se reabre ${item.clave}: ${item.caja} ya tiene otra sesión abierta.`);
                estado = apertura.estado;
            }
        }

        const dataApertura = {
            cajaId: caja.id,
            empleadoId: empleado.id,
            montoInicial: item.montoInicial,
            fechaApertura: new Date(item.fechaApertura),
            estado,
            desgloseInicio: item.desgloseInicio ?? null,
            observaciones: `${nota} ${item.observaciones ?? ''}`.trim(),
        };
        apertura = apertura
            ? await prisma.aperturaCaja.update({ where: { id: apertura.id }, data: { ...dataApertura, deletedAt: null } })
            : await prisma.aperturaCaja.create({ data: dataApertura });

        for (const movimiento of item.movimientos ?? []) {
            const notaMovimiento = marcaEjemplo(movimiento.clave);
            await guardar('movimientoCaja', { observaciones: { startsWith: notaMovimiento } }, {
                aperturaCajaId: apertura.id,
                empleadoId: empleado.id,
                tipo: movimiento.tipo,
                monto: movimiento.monto,
                concepto: movimiento.concepto,
                estado: movimiento.estado,
                observaciones: `${notaMovimiento} ${movimiento.observaciones ?? ''}`.trim(),
            });
        }

        if (item.corte) {
            const notaCorte = marcaEjemplo(item.corte.clave);
            await guardar('corteCaja', { observaciones: { startsWith: notaCorte } }, {
                aperturaCajaId: apertura.id,
                empleadoId: empleado.id,
                ...tomar(item.corte, [
                    'efectivoContado', 'totalEntradas', 'totalSalidas', 'totalVentas',
                    'totalVentasEfectivo', 'diferencia', 'estado', 'desgloseFin',
                ]),
                desgloseInicio: item.desgloseInicio ?? null,
                fechaValidacion: item.corte.fechaValidacion ? new Date(item.corte.fechaValidacion) : null,
                fechaCorte: new Date(item.corte.fechaCorte),
                observaciones: `${notaCorte} ${item.corte.observaciones ?? ''}`.trim(),
            });
        }
    }

    console.log('Registros de ejemplo sincronizados.');
}

async function main() {
    console.log('Iniciando seed declarativo...');

    // 1. UPSERT OBLIGATORIO DE LA EMPRESA PRINCIPAL (id = 1)
    await upsertEmpresaDefault();

    const defaultUser = await crearUsuarioDefault();

    // 2. CREACIÓN DE USUARIOS (Primero para que existan antes de asignar roles)
    if (seedData.usuarios && seedData.usuarios.length > 0) {
        for (const usuarioData of seedData.usuarios) {
            const usuario = await upsertUsuario(usuarioData);
            console.log(`Usuario preparado: ${usuario.nombre} <${usuario.email}>`);
        }
    }

    const acciones = new Map();
    for (const accion of seedData.acciones) {
        acciones.set(accion.nombre, {
            ...accion,
            registro: await upsertAccion(accion),
        });
    }

    const permisosPorModulo = new Map();
    for (const seccionData of seedData.secciones) {
        const seccion = await upsertSeccion(seccionData);
        console.log(`Sección: ${seccion.nombre}`);

        for (const moduloData of seccionData.modulos) {
            const modulo = await upsertModulo(seccion.id, moduloData);
            const permisos = [];

            for (const nombreAccion of moduloData.acciones) {
                const accion = acciones.get(nombreAccion);
                if (!accion) throw new Error(`La acción "${nombreAccion}" no está definida en seed-data.json`);

                permisos.push(await upsertPermiso(
                    modulo.id,
                    accion.registro.id,
                    accion.metodo,
                    `${accion.descripcion} — ${modulo.nombre}`
                ));
            }

            permisosPorModulo.set(modulo.nombre, permisos);
            console.log(`  Módulo: ${modulo.nombre}`);
        }
    }

    // Las secciones fuera del JSON que ya no tienen módulos activos se desactivan.
    const nombresSecciones = seedData.secciones.map((seccion) => seccion.nombre);
    await prisma.seccion.updateMany({
        where: {
            nombre: { notIn: nombresSecciones },
            deletedAt: null,
            modulos: { none: { deletedAt: null } },
        },
        data: { deletedAt: new Date() },
    });

    const todosLosPermisos = [...permisosPorModulo.values()].flat();
    for (const rolData of seedData.roles) {
        const rol = await upsertRol(rolData);
        const permisos = rolData.permisos === 'todos'
            ? todosLosPermisos
            : rolData.permisos.flatMap((moduloNombre) => permisosPorModulo.get(moduloNombre) ?? []);

        await sincronizarPermisosRol(rol.id, permisos.map((permiso) => permiso.id));
        if (rolData.asignarAlPrimerUsuario) {
            await asignarRolAlPrimerUsuario(rol.id);
            if (defaultUser) {
                await prisma.usuarioRol.upsert({
                    where: { usuarioId_rolId: { usuarioId: defaultUser.id, rolId: rol.id } },
                    update: { deletedAt: null },
                    create: { usuarioId: defaultUser.id, rolId: rol.id },
                });
                console.log(`Rol ${rol.nombre} asignado a ${defaultUser.nombre} <${defaultUser.email}>.`);
            }
        }
        console.log(`Rol: ${rol.nombre} (${permisos.length} permisos).`);
    }

    if (seedData.usuarios && seedData.usuarios.length > 0) {
        for (const usuarioData of seedData.usuarios) {
            if (usuarioData.rolNombre) {
                const usuario = await prisma.usuario.findUnique({ where: { email: usuarioData.email } });
                const rol = await prisma.rol.findUnique({ where: { nombre: usuarioData.rolNombre } });
                if (usuario && rol) {
                    await prisma.usuarioRol.upsert({
                        where: { usuarioId_rolId: { usuarioId: usuario.id, rolId: rol.id } },
                        update: { deletedAt: null },
                        create: { usuarioId: usuario.id, rolId: rol.id },
                    });
                    console.log(`Rol ${rol.nombre} asignado a ${usuario.nombre} <${usuario.email}>.`);
                }
            }
        }
    }

    const configsDefault = [
        { clave: 'mostrar_huella_digital_corte', valor: 'true', tipoDato: 'boolean', descripcion: 'Muestra u oculta la sección de huella digital y auditoría en el reporte PDF de corte de caja', empresaId: 1 },
        { clave: 'logo_sistema', valor: '', tipoDato: 'string', descripcion: 'URL o ruta del logotipo del sistema para reportes', empresaId: 1 },
        { clave: 'nombre_sistema', valor: 'ApexGym', tipoDato: 'string', descripcion: 'Nombre comercial del gimnasio', empresaId: 1 },
    ];
    for (const configItem of configsDefault) {
        await prisma.configuracionSistema.upsert({
            where: { clave: configItem.clave },
            update: { tipoDato: configItem.tipoDato, descripcion: configItem.descripcion, empresaId: 1, deletedAt: null },
            create: configItem,
        });
    }
    console.log('Configuraciones del sistema sincronizadas.');

    await sembrarEjemplos(seedData.ejemplos);

    console.log('Seed completado correctamente.');
}

main()
    .catch((error) => {
        console.error('Error en el seed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
