/**
 * Lanzador de pruebas: pregunta por terminal las credenciales con las que se
 * obtiene el token (para validar los privilegios de ese usuario) y despues
 * ejecuta las pruebas de API con node:test.
 *
 * Si TEST_EMAIL y TEST_PASSWORD ya estan definidos (o no hay terminal
 * interactiva, ej. CI) no pregunta nada.
 */
import 'dotenv/config';
import readline from 'node:readline';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { listar as listarCredenciales, guardar as guardarCredencial, borrar as borrarCredencial, ARCHIVO } from './credenciales.js';

function preguntar(texto, oculto = false) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        if (oculto) {
            rl._writeToOutput = (s) => { if (s.includes(texto)) rl.output.write(s); };
        }
        rl.question(texto, (r) => { rl.close(); if (oculto) process.stdout.write('\n'); resolve(r.trim()); });
    });
}

const env = { ...process.env };

// Paso 1: verificar que la BD este en la ultima version del esquema (Prisma)
let migrar = (env.TEST_MIGRAR || '').toLowerCase();
if (!migrar && process.stdin.isTTY) {
    migrar = (await preguntar('Verificar y aplicar migraciones de Prisma antes de probar? (s/n): ')).toLowerCase();
}
if (migrar === 's' || migrar === 'si') {
    const comandos = [
        ['migrate', 'status'],      // informa si hay migraciones pendientes (puede salir con error si las hay)
        ['migrate', 'deploy'],      // aplica las pendientes sin borrar datos
        ['generate'],               // regenera el cliente de Prisma
    ];
    for (const [i, args] of comandos.entries()) {
        console.log(`\n> npx prisma ${args.join(' ')}`);
        const r = spawnSync('npx', ['prisma', ...args], { env, stdio: 'inherit', shell: true });
        if (r.status !== 0 && i > 0) {
            console.error(`\nFallo "prisma ${args.join(' ')}". Se cancelan las pruebas.`);
            process.exit(r.status ?? 1);
        }
    }
    console.log('');
    await generarMigracionSiHaceFalta();
}
if ((!env.TEST_EMAIL || !env.TEST_PASSWORD) && process.stdin.isTTY) {
    console.log('--- Credenciales para las pruebas de API ---');
    const guardadas = listarCredenciales();
    let elegida = null;

    if (guardadas.length) {
        guardadas.forEach((c, i) => console.log(`  ${i + 1}) ${c.email}`));
        console.log(`  n) Usar otro usuario`);
        console.log(`  b) Borrar un usuario guardado`);
        const op = (await preguntar('Elige una opcion [1]: ')).toLowerCase() || '1';
        if (op === 'b') {
            const n = Number(await preguntar('Numero del usuario a borrar: '));
            if (guardadas[n - 1]) { borrarCredencial(guardadas[n - 1].email); console.log('Borrado.'); }
            process.exit(0);
        }
        if (/^\d+$/.test(op) && guardadas[Number(op) - 1]) elegida = guardadas[Number(op) - 1];
    }

    if (elegida) {
        env.TEST_EMAIL = elegida.email;
        env.TEST_PASSWORD = elegida.password;
    } else {
        const email = (await preguntar('Correo [admin@apexgym.com]: ')) || 'admin@apexgym.com';
        const pass = (await preguntar('Contrasena [Password123!]: ', true)) || 'Password123!';
        env.TEST_EMAIL = email;
        env.TEST_PASSWORD = pass;
        const guardar = (await preguntar(`Guardar este acceso cifrado en ${ARCHIVO}? (s/n): `)).toLowerCase();
        if (guardar === 's' || guardar === 'si') guardarCredencial(email, pass);
    }
}

const hijo = spawn(process.execPath, ['--test', 'tests/api/api.test.js'], { env, stdio: 'inherit' });
hijo.on('exit', (codigo) => process.exit(codigo ?? 1));


/**
 * Detecta si schema.prisma tiene cambios sin migracion (BD ya migrada vs schema).
 * Si los hay, muestra el SQL y ofrece generar la migracion y aplicarla.
 */
async function generarMigracionSiHaceFalta() {
    const prisma = (args, opts = {}) =>
        spawnSync('npx', ['prisma', ...args], { env, shell: true, encoding: 'utf8', ...opts });

    const diff = prisma(['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--script']);
    // Se descartan los DropIndex de indices *_fkey: son los indices que MySQL/MariaDB crea
    // automaticamente para las llaves foraneas y Prisma los reporta como "sobrantes".
    const sql = (diff.stdout || '')
        .split(/\r?\n\r?\n/)
        .filter((bloque) => !(/^-- DropIndex/m.test(bloque) && /_fkey`/.test(bloque)))
        .join('\n\n')
        .trim();
    const sinCambios = diff.status !== 0 || !sql || /^-- This is an empty migration\.?$/m.test(sql);
    if (sinCambios) {
        if (diff.status !== 0) console.warn('No se pudo comparar schema.prisma contra la BD:\n' + (diff.stderr || '').trim());
        else console.log('schema.prisma no tiene cambios pendientes de migracion.');
        return;
    }

    console.log('\n!!! schema.prisma tiene cambios SIN migracion. SQL que falta:\n');
    console.log(sql.split('\n').slice(0, 60).join('\n'));
    if (sql.split('\n').length > 60) console.log('... (SQL recortado)');

    let respuesta = (env.TEST_GENERAR_MIGRACION || '').toLowerCase();
    if (!respuesta && process.stdin.isTTY) {
        respuesta = (await preguntar('\nGenerar y aplicar esta migracion? (s/n): ')).toLowerCase();
    }
    if (respuesta !== 's' && respuesta !== 'si') {
        console.log('Se omite la generacion de la migracion.');
        return;
    }

    let nombre = env.TEST_NOMBRE_MIGRACION || '';
    if (!nombre && process.stdin.isTTY) nombre = await preguntar('Nombre de la migracion [sincronizar_schema]: ');
    nombre = (nombre || 'sincronizar_schema').replace(/[^a-zA-Z0-9_]+/g, '_');

    const marca = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const carpeta = `prisma/migrations/${marca}_${nombre}`;
    fs.mkdirSync(carpeta, { recursive: true });
    fs.writeFileSync(`${carpeta}/migration.sql`, sql + '\n');
    console.log(`\nMigracion creada: ${carpeta}/migration.sql`);

    console.log('\n> npx prisma migrate deploy');
    const r = spawnSync('npx', ['prisma', 'migrate', 'deploy'], { env, stdio: 'inherit', shell: true });
    if (r.status !== 0) {
        console.error('\nFallo al aplicar la migracion generada. Revisa el SQL en ' + carpeta);
        process.exit(r.status ?? 1);
    }
}


