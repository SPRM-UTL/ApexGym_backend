import 'dotenv/config';
import { prisma, pool } from '../dao/BaseDao.js';

async function main() {
    console.log('Iniciando limpieza quirúrgica del módulo de ventas y caja...');

    const tablasTransaccionales = [
        'devolucion_detalle',
        'devoluciones',
        'movimientos_caja',
        'cortes_caja',
        'transacciones_pagos',
        'detalle_venta',
        'venta',
        'FolioVenta',
        'aperturas_caja',
    ];

    const catalogos = [
        { nombre: 'cajas (catálogo maestro)', model: prisma.caja },
        { nombre: 'metodo_pago', model: prisma.metodoPago },
        { nombre: 'producto', model: prisma.producto },
        { nombre: 'servicios', model: prisma.servicio },
        { nombre: 'usuarios', model: prisma.usuario },
        { nombre: 'clientes', model: prisma.cliente },
        { nombre: 'empleados', model: prisma.empleado },
    ];

    let conn;
    try {
        // Usar la misma conexión para que SET FOREIGN_KEY_CHECKS = 0 aplique a todos los truncates
        conn = await pool.getConnection();

        await conn.query('SET FOREIGN_KEY_CHECKS = 0;');

        for (const tabla of tablasTransaccionales) {
            await conn.query(`TRUNCATE TABLE \`${tabla}\`;`);
            console.log(`  ✓ Tabla vaciada y contador reiniciado: ${tabla}`);
        }

        await conn.query('SET FOREIGN_KEY_CHECKS = 1;');

        console.log('\n--- VERIFICACIÓN DE TABLAS TRANSACCIONALES (deben ser 0) ---');
        for (const tabla of tablasTransaccionales) {
            const rows = await conn.query(`SELECT COUNT(*) AS total FROM \`${tabla}\`;`);
            const total = Number(rows[0]?.total ?? rows[0]?.TOTAL ?? 0);
            console.log(`  ${tabla.padEnd(25)} : ${total} registros`);
        }

        console.log('\n--- VERIFICACIÓN DE CATÁLOGOS MAESTROS (deben permanecer intactos) ---');
        for (const cat of catalogos) {
            const count = await cat.model.count();
            console.log(`  ${cat.nombre.padEnd(25)} : ${count} registros conservados`);
        }

        console.log('\n¡Limpieza completada exitosamente! Base de datos lista.');
    } catch (error) {
        console.error('Error durante la limpieza:', error);
    } finally {
        if (conn) conn.release();
        await prisma.$disconnect();
        await pool.end();
    }
}

main();
