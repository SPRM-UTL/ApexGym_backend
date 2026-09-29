/**
 * Verificación del seed — muestra el estado completo de permisos en BD
 */
import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import mariadb from 'mariadb';
import 'dotenv/config';

const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

const adapter = new PrismaMariaDb(pool);
const prisma = new PrismaClient({ adapter });

// 1. Permisos completos del módulo Usuarios
console.log('\n══════════════════════════════════════════════════');
console.log('  PERMISOS DEL MÓDULO USUARIOS');
console.log('══════════════════════════════════════════════════');
const permisos = await prisma.permiso.findMany({
    include: {
        modulo: { include: { seccion: true } },
        accion: true,
    },
    orderBy: { id: 'asc' },
});
for (const p of permisos) {
    console.log(`  [${p.id}] ${p.modulo.seccion.nombre} > ${p.modulo.nombre} | ${p.accion.nombre} [${p.metodo}]`);
}

// 2. Roles y sus permisos
console.log('\n══════════════════════════════════════════════════');
console.log('  ROLES Y SUS PERMISOS');
console.log('══════════════════════════════════════════════════');
const roles = await prisma.rol.findMany({
    include: {
        permisos: {
            include: {
                permiso: {
                    include: { accion: true, modulo: true },
                },
            },
        },
    },
});
for (const rol of roles) {
    console.log(`\n  Rol: "${rol.nombre}" (id=${rol.id})`);
    for (const rp of rol.permisos) {
        console.log(`    ↳ ${rp.permiso.modulo.nombre} | ${rp.permiso.accion.nombre} [${rp.permiso.metodo}]`);
    }
}

// 3. Usuarios con sus roles
console.log('\n══════════════════════════════════════════════════');
console.log('  USUARIOS Y SUS ROLES ASIGNADOS');
console.log('══════════════════════════════════════════════════');
const usuarios = await prisma.usuario.findMany({
    where: { deletedAt: null },
    include: {
        usuarioRols: {
            include: { rol: true },
        },
    },
    omit: { contrasenia: true, createdAt: true, updatedAt: true, deletedAt: true },
});
for (const u of usuarios) {
    const roles = u.usuarioRols.map(ur => `"${ur.rol.nombre}"`).join(', ') || '(sin roles)';
    console.log(`\n  Usuario: "${u.nombre}" <${u.email}> (id=${u.id})`);
    console.log(`    Roles: ${roles}`);
}

console.log('\n══════════════════════════════════════════════════\n');

await prisma.$disconnect();
await pool.end();
