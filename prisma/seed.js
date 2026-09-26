/**
 * Prisma Seed — Datos iniciales de permisos CRUD para Usuarios
 *
 * Estructura que se crea:
 *   Sección:  Administración
 *   Módulo:   Usuarios
 *   Acciones: Listar, Crear, Editar, Eliminar
 *   Permisos: (módulo × acción × método HTTP)
 *   Rol:      Administrador  →  todos los permisos anteriores
 *   Asignar el rol "Administrador" al primer usuario activo
 *
 * Ejecución:
 *   npx prisma db seed
 */

import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import mariadb from 'mariadb';
import 'dotenv/config';

// ── Conexión ────────────────────────────────────────────────────────────────
const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

const adapter = new PrismaMariaDb(pool);
const prisma = new PrismaClient({ adapter });

// ── Datos del seed ──────────────────────────────────────────────────────────
const SECCION_NOMBRE = 'Administración';
const MODULO_NOMBRE = 'Usuarios';
const ROL_NOMBRE = 'Administrador';
const ROL_DESCRIPCION = 'Acceso total al CRUD de usuarios';

/** Acciones CRUD mapeadas al método HTTP correspondiente */
const ACCIONES = [
    { nombre: 'Listar', descripcion: 'Ver listado de registros', metodo: 'GET' },
    { nombre: 'Crear', descripcion: 'Crear nuevos registros', metodo: 'POST' },
    { nombre: 'Editar', descripcion: 'Editar registros existentes', metodo: 'PUT' },
    { nombre: 'Eliminar', descripcion: 'Eliminar registros', metodo: 'DELETE' },
];

// ── Helpers ─────────────────────────────────────────────────────────────────
const upsertSeccion = (nombre, descripcion) =>
    prisma.seccion.upsert({
        where: { nombre },
        update: {},
        create: { nombre, descripcion },
    });

const upsertModulo = (seccionId, nombre, descripcion) =>
    prisma.modulo.upsert({
        where: { modulo_seccion_unico: { seccionId, nombre } },
        update: {},
        create: { seccionId, nombre, descripcion },
    });

const upsertAccion = ({ nombre, descripcion }) =>
    prisma.accion.upsert({
        where: { nombre },
        update: {},
        create: { nombre, descripcion },
    });

const upsertPermiso = (moduloId, accionId, metodo, descripcion) =>
    prisma.permiso.upsert({
        where: { permiso_unico: { moduloId, accionId, metodo } },
        update: {},
        create: { moduloId, accionId, metodo, descripcion },
    });

const upsertRol = (nombre, descripcion) =>
    prisma.rol.upsert({
        where: { nombre },
        update: {},
        create: { nombre, descripcion },
    });

const upsertRolPermiso = (rolId, permisoId) =>
    prisma.rolPermiso.upsert({
        where: { rolId_permisoId: { rolId, permisoId } },
        update: {},
        create: { rolId, permisoId },
    });

const upsertUsuarioRol = (usuarioId, rolId) =>
    prisma.usuarioRol.upsert({
        where: { usuarioId_rolId: { usuarioId, rolId } },
        update: {},
        create: { usuarioId, rolId },
    });

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
    console.log('🌱 Iniciando seed...\n');

    // 1. Sección
    const seccion = await upsertSeccion(SECCION_NOMBRE, 'Sección de administración del sistema');
    console.log(`✅ Sección:  "${seccion.nombre}"  (id=${seccion.id})`);

    // 2. Módulo
    const modulo = await upsertModulo(seccion.id, MODULO_NOMBRE, 'Gestión de usuarios del sistema');
    console.log(`✅ Módulo:   "${modulo.nombre}"   (id=${modulo.id})`);

    // 3. Acciones + Permisos
    const permisos = [];
    for (const def of ACCIONES) {
        const accion = await upsertAccion(def);
        console.log(`   Acción:  "${accion.nombre}" (id=${accion.id})`);

        const permiso = await upsertPermiso(
            modulo.id,
            accion.id,
            def.metodo,
            `${def.descripcion} — ${MODULO_NOMBRE}`
        );
        console.log(`   Permiso: id=${permiso.id}  [${def.metodo}]`);
        permisos.push(permiso);
    }

    // 4. Rol
    const rol = await upsertRol(ROL_NOMBRE, ROL_DESCRIPCION);
    console.log(`\n✅ Rol:      "${rol.nombre}" (id=${rol.id})`);

    // 5. Asignar permisos al rol
    for (const permiso of permisos) {
        await upsertRolPermiso(rol.id, permiso.id);
    }
    console.log(`✅ Permisos asignados al rol "${ROL_NOMBRE}": ${permisos.length}`);

    // 6. Asignar rol al primer usuario activo
    const primerUsuario = await prisma.usuario.findFirst({
        where: { deletedAt: null },
        orderBy: { id: 'asc' },
        select: { id: true, nombre: true, email: true },
    });

    if (!primerUsuario) {
        console.warn('\n⚠️  No hay usuarios activos. El rol no se asignó a ningún usuario.');
        console.warn('   Registra un usuario y vuelve a ejecutar el seed para asignarlo.\n');
    } else {
        await upsertUsuarioRol(primerUsuario.id, rol.id);
        console.log(`\n✅ Rol "${ROL_NOMBRE}" asignado a:`);
        console.log(`   Usuario: "${primerUsuario.nombre}" <${primerUsuario.email}>  (id=${primerUsuario.id})`);
    }

    console.log('\n🎉 Seed completado correctamente.\n');
}

main()
    .catch((e) => {
        console.error('❌ Error en el seed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
