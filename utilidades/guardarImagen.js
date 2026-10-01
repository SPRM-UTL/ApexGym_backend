import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Guarda una imagen en formato base64 en el disco del servidor bajo la carpeta /public/imagenes/{modulo}/
 *
 * @param {string} imagenData - Cadena Data URL base64 (ej. "data:image/png;base64,...") o ruta existente.
 * @param {string} modulo - Nombre de la subcarpeta del módulo (ej. "empleados").
 * @returns {string | null} Ruta relativa estática de la imagen (ej. "/imagenes/empleados/img_123.jpg") o null.
 */
export function guardarImagenServidor(imagenData, modulo = 'general') {
    if (!imagenData || typeof imagenData !== 'string') return null;

    // Si ya es una ruta guardada previamente en el servidor, se mantiene igual
    if (imagenData.startsWith('/imagenes/')) return imagenData;

    // Verificar si es un string base64 tipo Data URL
    const match = imagenData.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
    if (!match) return null;

    const extension = match[1] === 'jpeg' ? 'jpg' : match[1];
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');

    const carpetaModulo = path.join(__dirname, '../public/imagenes', modulo);
    if (!fs.existsSync(carpetaModulo)) {
        fs.mkdirSync(carpetaModulo, { recursive: true });
    }

    const nombreArchivo = `img_${Date.now()}_${Math.floor(Math.random() * 10000)}.${extension}`;
    const rutaAbsoluta = path.join(carpetaModulo, nombreArchivo);

    fs.writeFileSync(rutaAbsoluta, buffer);

    return `/imagenes/${modulo}/${nombreArchivo}`;
}
