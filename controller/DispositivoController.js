import { prisma } from '../dao/BaseDao.js';
import { ResponseModel } from '../modelos/ResponseModel.js';

const PLATAFORMAS = new Set(['ANDROID', 'IOS', 'WEB']);
const LONGITUD_MAX_TOKEN = 768;

export class DispositivoController {
    constructor(prismaClient = prisma) {
        this.prisma = prismaClient;
    }

    registrarToken = async (req, res) => {
        try {
            const usuarioId = Number(req.usuario?.id ?? req.user?.id);
            const empresaId = Number(req.usuario?.empresaId ?? req.user?.empresaId ?? 1);
            const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
            const plataforma = typeof req.body?.plataforma === 'string'
                ? req.body.plataforma.trim().toUpperCase()
                : '';

            if (!Number.isSafeInteger(usuarioId) || usuarioId < 1
                || !token || token.length > LONGITUD_MAX_TOKEN
                || !PLATAFORMAS.has(plataforma)) {
                return res.status(400).json(new ResponseModel(null, 1, 'Los datos del dispositivo no son válidos', 400));
            }

            const cliente = await this.prisma.cliente.findFirst({
                where: { usuarioId, empresaId, deletedAt: null },
                select: { id: true },
            });
            const empleado = cliente ? null : await this.prisma.empleado.findFirst({
                where: { usuarioId, empresaId, deletedAt: null },
                select: { id: true },
            });

            let tipo = cliente ? 'CLIENTE' : empleado ? 'EMPLEADO' : null;
            if (!tipo && typeof this.prisma.usuarioRol?.findFirst === 'function') {
                const rolAdmin = await this.prisma.usuarioRol.findFirst({
                    where: {
                        usuarioId,
                        deletedAt: null,
                        rol: {
                            deletedAt: null,
                            nombre: { not: 'Cliente' },
                        },
                    },
                    include: { rol: { select: { nombre: true } } },
                });
                if (rolAdmin && rolAdmin.rol?.nombre?.toLowerCase() !== 'cliente') {
                    tipo = 'USUARIO';
                }
            }

            if (!tipo) {
                return res.status(403).json(new ResponseModel(null, 1, 'La cuenta no tiene un cliente o empleado activo asociado', 403));
            }

            const dispositivo = await this.prisma.dispositivo.upsert({
                where: { token },
                create: { empresaId, usuarioId, tipo, token, plataforma },
                update: { empresaId, usuarioId, tipo, plataforma },
                select: { id: true, tipo: true, plataforma: true, updatedAt: true },
            });
            return res.status(200).json(new ResponseModel(dispositivo, 0, 'Token del dispositivo registrado correctamente', 200));
        } catch (error) {
            console.error('[DispositivoController Error]:', error.code ?? 'registro fallido');
            return res.status(500).json(new ResponseModel(null, 1, 'No se pudo registrar el dispositivo', 500));
        }
    };
}

export const dispositivoController = new DispositivoController();
