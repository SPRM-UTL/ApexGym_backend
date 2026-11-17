import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

const ES_CLOUDFLARE = process.env.CLOUDFLARE === 'true' || process.env.NODE_ENV === 'production';

let DIRECTORIO_FOTOS_USUARIOS = '';
let RAIZ_BACKEND = '';

if (!ES_CLOUDFLARE) {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    RAIZ_BACKEND = path.resolve(__dirname, '..');
    DIRECTORIO_FOTOS_USUARIOS = path.join(RAIZ_BACKEND, 'uploads', 'usuarios');

    if (!fs.existsSync(DIRECTORIO_FOTOS_USUARIOS)) {
        fs.mkdirSync(DIRECTORIO_FOTOS_USUARIOS, { recursive: true });
    }
}

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

// Storage: Cloudinary en producción (contenedores/Cloudflare), disco local en desarrollo
const storage = ES_CLOUDFLARE
    ? new CloudinaryStorage({
        cloudinary: cloudinary,
        params: async (_req, file) => {
            const extOriginal = path.extname(file.originalname || '').toLowerCase();
            const ext = extOriginal || EXTENSION_POR_MIME[file.mimetype] || '.jpg';
            const publicId = `apexgym/usuarios/${crypto.randomUUID()}`;
            return {
                folder: 'apexgym/usuarios',
                public_id: publicId,
                resource_type: 'image',
                allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
                transformation: [
                    { width: 800, height: 800, crop: 'limit', quality: 'auto:good' },
                ],
            };
        },
    })
    : multer.diskStorage({
        destination: (_req, _file, cb) => {
            if (!fs.existsSync(DIRECTORIO_FOTOS_USUARIOS)) {
                fs.mkdirSync(DIRECTORIO_FOTOS_USUARIOS, { recursive: true });
            }
            cb(null, DIRECTORIO_FOTOS_USUARIOS);
        },
        filename: (_req, file, cb) => {
            const extOriginal = path.extname(file.originalname || '').toLowerCase();
            const ext = extOriginal || EXTENSION_POR_MIME[file.mimetype] || '.jpg';
            const nombreArchivo = `${crypto.randomUUID()}${ext}`;
            cb(null, nombreArchivo);
        },
    });

const fileFilter = (_req, file, cb) => {
    if (MIME_PERMITIDOS.has(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Formato de imagen no válido. Usa JPG, PNG, GIF o WEBP.'));
    }
};

export const uploadFotoUsuario = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
    },
}).single('foto');

export async function eliminarArchivoSubido(rutaRelativa) {
    if (ES_CLOUDFLARE) {
        // En producción (Cloudflare/contenedores) usar Cloudinary
        if (!rutaRelativa || typeof rutaRelativa !== 'string') return;
        // rutaRelativa en Cloudinary será el public_id o la URL completa
        const publicId = extraerPublicIdDeCloudinary(rutaRelativa);
        if (publicId) {
            try {
                await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
            } catch {
                // Ignorar errores al eliminar archivo antiguo
            }
        }
        return;
    }

    if (!rutaRelativa || typeof rutaRelativa !== 'string') return;
    const rutaLimpia = rutaRelativa.replace(/^\/+/, '');
    if (!rutaLimpia.startsWith('uploads/')) return;

    const rutaAbsoluta = path.join(RAIZ_BACKEND, rutaLimpia);
    if (fs.existsSync(rutaAbsoluta)) {
        try {
            fs.unlinkSync(rutaAbsoluta);
        } catch {
            // Ignorar errores al eliminar archivo antiguo
        }
    }
}

/**
 * Extrae el public_id de Cloudinary desde una URL o public_id directo
 * Ejemplos:
 * - "https://res.cloudinary.com/demo/image/upload/v123/apexgym/usuarios/abc123.jpg" -> "apexgym/usuarios/abc123"
 * - "apexgym/usuarios/abc123" -> "apexgym/usuarios/abc123"
 */
function extraerPublicIdDeCloudinary(input) {
    if (!input || typeof input !== 'string') return null;
    
    // Si ya es un public_id simple (sin URL)
    if (!input.includes('cloudinary.com') && !input.includes('http')) {
        // Remover extensión si la tiene
        return input.replace(/\.[^.]+$/, '');
    }
    
    // Extraer de URL de Cloudinary
    const match = input.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/);
    if (match) {
        return match[1];
    }
    
    return null;
}
