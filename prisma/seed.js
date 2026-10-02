/**
 * Seed declarativo de secciones, módulos, permisos y roles.
 * Los datos editables viven en ./seed-data.json.
 *
 * Ejecución: npx prisma db seed
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
});

const adapter = new PrismaMariaDb(pool);
const prisma = new PrismaClient({ adapter });

const upsertSeccion = (seccion) => prisma.seccion.upsert({
    where: { nombre: seccion.nombre },
    update: {
        descripcion: seccion.descripcion,
        imagenUrl: seccion.imagenUrl,
        imagenPublicId: seccion.imagenPublicId,
        deletedAt: null,
    },
    create: {
        nombre: seccion.nombre,
        descripcion: seccion.descripcion,
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
    update: { descripcion: rol.descripcion, deletedAt: null },
    create: { nombre: rol.nombre, descripcion: rol.descripcion },
});

// Función para insertar/actualizar usuarios desde el JSON
const upsertUsuario = async (usuario) => {
    // Si tu JSON usa usuario.password o usuario.contrasenia, lo tomamos aquí:
    const plainPassword = usuario.password || usuario.contrasenia;
    const hashedPassword = encriptarContrasena(plainPassword);

    return prisma.usuario.upsert({
        where: { email: usuario.email },
        update: {
            nombre: usuario.nombre,
            contrasenia: hashedPassword, // Cambiado de password a contrasenia
            deletedAt: null,
        },
        create: {
            nombre: usuario.nombre,
            email: usuario.email,
            contrasenia: hashedPassword, // Cambiado de password a contrasenia
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
            deletedAt: null,
        },
        create: {
            nombre: 'Administrador ApexGym',
            email,
            contrasenia,
        },
    });

    console.log(`Usuario por defecto creado/actualizado: ${usuario.nombre} <${usuario.email}>`);
    return usuario;
}

async function main() {
    console.log('Iniciando seed declarativo...');

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