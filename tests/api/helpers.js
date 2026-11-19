import 'dotenv/config';
import { spawn } from 'node:child_process';

const PUERTO_PRUEBAS = process.env.TEST_PORT || '3999';
export const BASE_URL = process.env.TEST_BASE_URL || `http://localhost:${PUERTO_PRUEBAS}`;
export const EMAIL = process.env.TEST_EMAIL || 'admin@apexgym.com';
export const PASSWORD = process.env.TEST_PASSWORD || 'Password123!';

let servidor = null;

async function responde() {
    try {
        await fetch(`${BASE_URL}/api/usuarios/login-movil`, { method: 'POST' });
        return true;
    } catch {
        return false;
    }
}

/** Levanta la app local con las variables del .env si no hay servidor ya corriendo. */
export async function iniciarServidor() {
    if (await responde()) return;
    if (process.env.TEST_BASE_URL) throw new Error(`No hay respuesta en ${BASE_URL}`);

    servidor = spawn(process.execPath, ['index.js'], {
        env: { ...process.env, PORT: PUERTO_PRUEBAS },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let salida = '';
    servidor.stdout.on('data', (d) => (salida += d));
    servidor.stderr.on('data', (d) => (salida += d));

    for (let i = 0; i < 60; i++) {
        if (await responde()) return;
        if (servidor.exitCode !== null) break;
        await new Promise((r) => setTimeout(r, 500));
    }
    detenerServidor();
    throw new Error(`La app no arranco:\n${salida}`);
}

export function detenerServidor() {
    servidor?.kill();
    servidor = null;
}

export async function peticion(metodo, ruta, { token, body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${BASE_URL}${ruta}`, {
        method: metodo,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch { /* respuesta sin JSON */ }
    return { status: res.status, json };
}

export async function obtenerToken() {
    const { status, json } = await peticion('POST', '/api/usuarios/login-movil', {
        body: { email: EMAIL, contrasenia: PASSWORD },
    });
    const token = json?.data?.token ?? json?.datos?.token ?? json?.token;
    if (status !== 200 || !token) {
        throw new Error(`Login fallido (${status}): ${JSON.stringify(json)}`);
    }
    return token;
}
