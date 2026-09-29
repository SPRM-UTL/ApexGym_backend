import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ_BACKEND = path.resolve(__dirname, '..');
const DIRECTORIO_FOTOS_USUARIOS = path.join(RAIZ_BACKEND, 'uploads', 'usuarios');

if (!fs.existsSync(DIRECTORIO_FOTOS_USUARIOS)) {
    fs.mkdirSync(DIRECTORIO_FOTOS_USUARIOS, { recursive: true });
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

const storage = multer.diskStorage({
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

export function eliminarArchivoSubido(rutaRelativa) {
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
