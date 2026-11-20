import 'dotenv/config';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

function obtenerCuentaServicio() {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) return null;

    let cuenta;
    try {
        cuenta = JSON.parse(raw);
    } catch {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON debe contener JSON válido');
    }

    if (!cuenta.project_id || !cuenta.client_email || !cuenta.private_key) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON no contiene los campos requeridos');
    }
    return cuenta;
}

const cuentaServicio = obtenerCuentaServicio();
const appPredeterminada = getApps().find((app) => app.name === '[DEFAULT]');
const firebaseApp = appPredeterminada ?? (cuentaServicio
    ? initializeApp({ credential: cert(cuentaServicio) })
    : null);

export const firebaseMessaging = firebaseApp ? getMessaging(firebaseApp) : null;
