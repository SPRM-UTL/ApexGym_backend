import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';

function configurarCloudinary() {
    const config = {
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true,
    };
    if (!config.cloud_name || !config.api_key || !config.api_secret) {
        throw new Error('Falta configurar CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET');
    }

    cloudinary.config(config);
}

/**
 * Guarda imágenes de productos en Cloudinary y las de otros módulos en el disco del servidor.
 *
 * @param {string} imagenData - Cadena Data URL base64 (ej. "data:image/png;base64,...") o ruta existente.
 * @param {string} modulo - Nombre de la subcarpeta del módulo (ej. "empleados").
 * @returns {Promise<{url: string, publicId: string | null} | null>} URL de la imagen guardada o null.
 */
export async function guardarImagenServidor(imagenData, modulo = 'general') {
    if (!imagenData || typeof imagenData !== 'string') return null;

    // Si ya es una ruta guardada previamente en el servidor, se mantiene igual
    if (imagenData.startsWith('/imagenes/')) {
        return { url: imagenData, publicId: null };
    }

    // Los productos existentes pueden conservar su URL de Cloudinary al editar otros campos
    if (modulo === 'productos' && /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//.test(imagenData)) {
        return { url: imagenData, publicId: null };
    }

    // Verificar si es un string base64 tipo Data URL
    const match = imagenData.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
    if (!match) {
        if (modulo === 'productos') {
            throw new Error('La imagen del producto debe ser base64 o una URL existente de Cloudinary');
        }
        return null;
    }

    const extension = match[1] === 'jpeg' ? 'jpg' : match[1];
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');

    if (modulo === 'productos') {
        const base64Normalizado = base64Data.replace(/=+$/, '');
        if (
            !['jpg', 'png', 'gif', 'webp'].includes(extension)
            || buffer.length === 0
            || buffer.length > 5 * 1024 * 1024
            || buffer.toString('base64').replace(/=+$/, '') !== base64Normalizado
        ) {
            throw new Error('La imagen del producto debe ser JPG, PNG, GIF o WEBP válida y no superar 5 MB');
        }

        configurarCloudinary();
        const resultado = await cloudinary.uploader.upload(imagenData, {
            folder: 'apexgym/productos',
            public_id: crypto.randomUUID(),
            resource_type: 'image',
            allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        });
        if (!resultado.secure_url || !resultado.public_id) {
            throw new Error('Cloudinary no devolvió la URL y el identificador de la imagen');
        }

        return { url: resultado.secure_url, publicId: resultado.public_id };
    }

    // Calcular __dirname en tiempo de ejecución para compatibilidad con Cloudflare Workers
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const carpetaModulo = path.join(__dirname, '../public/imagenes', modulo);
    if (!fs.existsSync(carpetaModulo)) {
        fs.mkdirSync(carpetaModulo, { recursive: true });
    }

    const nombreArchivo = `img_${Date.now()}.${extension}`;
    const rutaAbsoluta = path.join(carpetaModulo, nombreArchivo);

    fs.writeFileSync(rutaAbsoluta, buffer);

    return { url: `/imagenes/${modulo}/${nombreArchivo}`, publicId: null };
}

export async function eliminarImagenCloudinary(publicId) {
    if (typeof publicId !== 'string' || !publicId.trim()) {
        return 'skipped';
    }

    const publicIdLimpio = publicId.trim();
    configurarCloudinary();
    const resultado = await cloudinary.uploader.destroy(publicIdLimpio, {
        resource_type: 'image',
        invalidate: true,
    });

    if (resultado.result !== 'ok' && resultado.result !== 'not found') {
        throw new Error(`Cloudinary no pudo eliminar la imagen anterior (${resultado.result || 'sin resultado'})`);
    }

    return resultado.result;
}