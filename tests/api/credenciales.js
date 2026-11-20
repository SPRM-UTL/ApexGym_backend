/**
 * Almacen local de credenciales de prueba (cifradas, NO hasheadas).
 *
 * Un hash es irreversible y no sirve para volver a iniciar sesion, por eso se
 * cifra con AES-256-GCM. La llave se genera al azar y vive junto al archivo en
 * la carpeta del usuario (fuera del repo), con permisos solo de lectura del dueno.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = path.join(os.homedir(), '.apexgym-tests');
export const ARCHIVO = path.join(DIR, 'credenciales.enc.json');
const LLAVE = path.join(DIR, 'llave.bin');

function obtenerLlave() {
    fs.mkdirSync(DIR, { recursive: true });
    if (!fs.existsSync(LLAVE)) fs.writeFileSync(LLAVE, crypto.randomBytes(32), { mode: 0o600 });
    return fs.readFileSync(LLAVE);
}

function cifrar(texto) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', obtenerLlave(), iv);
    const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
    return { iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), datos: datos.toString('base64') };
}

function descifrar({ iv, tag, datos }) {
    const d = crypto.createDecipheriv('aes-256-gcm', obtenerLlave(), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(datos, 'base64')), d.final()]).toString('utf8');
}

/** Devuelve [{ email, password }]; si el archivo o la llave no sirven, devuelve []. */
export function listar() {
    try {
        return JSON.parse(descifrar(JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'))));
    } catch {
        return [];
    }
}

function escribir(lista) {
    obtenerLlave();
    fs.writeFileSync(ARCHIVO, JSON.stringify(cifrar(JSON.stringify(lista))), { mode: 0o600 });
}

export function guardar(email, password) {
    const lista = listar().filter((c) => c.email !== email);
    lista.push({ email, password });
    escribir(lista);
}

export function borrar(email) {
    escribir(listar().filter((c) => c.email !== email));
}
