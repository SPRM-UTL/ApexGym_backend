import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

const ES_CLOUDFLARE = process.env.CLOUDFLARE === 'true' || process.env.NODE_ENV === 'production';

// import.meta.url puede no existir en Cloudflare Workers; se usa cwd como respaldo.
const __dirname_backend = import.meta.url ? path.dirname(fileURLToPath(import.meta.url)) : process.cwd();
const RAIZ_BACKEND = path.resolve(__dirname_backend, '..');
const DIRECTORIO_IMAGENES = path.join(RAIZ_BACKEND, 'uploads');

// Configurar Cloudinary para producción/contenedores
if (ES_CLOUDFLARE) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true,
    });
}

const MIME_PERMITIDOS = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
]);

const EXTENSION_POR_MIME = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
};

const TRANSFORMACION_POR_DEFECTO = [
    { width: 1200, height: 1200, crop: 'limit', quality: 'auto:good' },
];

function esModuloValido(modulo) {
    return typeof modulo === 'string' && /^[a-z0-9_-]+$/i.test(modulo);
}

const fileFilter = (_req, file, cb) => {
    if (MIME_PERMITIDOS.has(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Formato de imagen no válido. Usa JPG, PNG, GIF o WEBP.'));
    }
};

function crearStorageImagen(modulo, transformation) {
    const carpetaCloudinary = `apexgym/${modulo}`;
    if (ES_CLOUDFLARE) {
        return new CloudinaryStorage({
            cloudinary,
            params: async () => ({
                folder: carpetaCloudinary,
                public_id: crypto.randomUUID(),
                resource_type: 'image',
                allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
                ...(transformation ? { transformation } : {}),
            }),
        });
    }

    const directorioLocal = path.join(DIRECTORIO_IMAGENES, modulo);
    return multer.diskStorage({
        destination: (_req, _file, cb) => {
            fs.mkdirSync(directorioLocal, { recursive: true });
            cb(null, directorioLocal);
        },
        filename: (_req, file, cb) => {
            const extOriginal = path.extname(file.originalname || '').toLowerCase();
            const ext = extOriginal || EXTENSION_POR_MIME[file.mimetype] || '.jpg';
            cb(null, `${crypto.randomUUID()}${ext}`);
        },
    });
}

function crearUploadImagen(modulo, campo, transformation) {
    return multer({
        storage: crearStorageImagen(modulo, transformation),
        fileFilter,
        limits: { fileSize: 5 * 1024 * 1024 },
    }).single(campo);
}

export function uploadImagen(
    modulo,
    { campo = 'imagen', transformation = TRANSFORMACION_POR_DEFECTO } = {}
) {
    if (!esModuloValido(modulo)) {
        throw new Error('El módulo de almacenamiento de imágenes no es válido');
    }

    return crearUploadImagen(modulo, campo, transformation);
}

export function obtenerImagen(modulo, archivo) {
    if (!archivo) return null;
    if (!esModuloValido(modulo)) {
        throw new Error('El módulo de almacenamiento de imágenes no es válido');
    }

    if (ES_CLOUDFLARE) {
        return { url: archivo.path, publicId: archivo.filename };
    }

    return { url: `/uploads/${modulo}/${archivo.filename}`, publicId: null };
}

export async function eliminarImagen(modulo, referencia = {}) {
    const { url, publicId } = referencia || {};
    if (!esModuloValido(modulo)) {
        throw new Error('El módulo de almacenamiento de imágenes no es válido');
    }

    if (ES_CLOUDFLARE) {
        const id = publicId || extraerPublicIdDeCloudinary(url, modulo);
        if (!id) return;
        if (!esPublicIdDelModulo(id, modulo)) {
            throw new Error(`El identificador de imagen no pertenece al módulo ${modulo}`);
        }

        const resultado = await cloudinary.uploader.destroy(id, {
            resource_type: 'image',
            invalidate: true,
        });
        if (resultado.result !== 'ok' && resultado.result !== 'not found') {
            throw new Error(`Cloudinary no pudo eliminar la imagen (${resultado.result || 'sin resultado'})`);
        }
        return;
    }

    if (typeof url !== 'string') return;
    const rutaRelativaPermitida = [
        `/uploads/${modulo}/`,
        `/imagenes/${modulo}/`,
    ].find((prefijo) => url.startsWith(prefijo));
    if (!rutaRelativaPermitida) return;

    const nombreArchivo = path.basename(url.split('?')[0]);
    if (!nombreArchivo || nombreArchivo !== url.split('?')[0].split('/').pop()) {
        throw new Error('La ruta de la imagen no es válida');
    }

    const directorioImagen = url.startsWith(`/uploads/${modulo}/`)
        ? path.join(DIRECTORIO_IMAGENES, modulo)
        : path.join(RAIZ_BACKEND, 'public', 'imagenes', modulo);
    const rutaArchivo = path.join(directorioImagen, nombreArchivo);
    if (fs.existsSync(rutaArchivo)) {
        fs.unlinkSync(rutaArchivo);
    }
}

function esPublicIdDelModulo(publicId, modulo) {
    const partes = publicId.split('/');
    while (partes[0] === 'apexgym' && partes[1] === modulo) {
        partes.splice(0, 2);
    }
    return partes.length === 1
        && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(partes[0]);
}

/**
 * Extrae el public_id de Cloudinary desde una URL o public_id directo
 * Ejemplos:
 * - "https://res.cloudinary.com/demo/image/upload/v123/apexgym/usuarios/abc123.jpg" -> "apexgym/usuarios/abc123"
 * - "apexgym/usuarios/abc123" -> "apexgym/usuarios/abc123"
 */
function extraerPublicIdDeCloudinary(input, modulo) {
    if (typeof input !== 'string') return null;

    let ruta;
    try {
        ruta = new URL(input).pathname;
    } catch {
        return null;
    }

    if (!ruta.startsWith('/')) return null;
    const indiceUpload = ruta.indexOf('/upload/');
    if (indiceUpload < 0) return null;

    let recurso = ruta.slice(indiceUpload + '/upload/'.length);
    const prefijoModulo = `apexgym/${modulo}/`;
    const indiceModulo = recurso.indexOf(prefijoModulo);
    if (indiceModulo >= 0) {
        recurso = recurso.slice(indiceModulo);
    } else {
        recurso = recurso.split('/').pop();
    }

    return recurso.replace(/\.[^/.]+$/, '');
}
