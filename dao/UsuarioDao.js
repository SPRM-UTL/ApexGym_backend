import { BaseDao } from "./BaseDao.js";
import { encriptarContrasena, verificarContrasena } from "../utilidades/utilesSeguridad.js";

export class UsuarioDao extends BaseDao {
    constructor() {
        super(
            "usuario",
            {
                omit: {
                    contrasenia: true,
                    createdAt: true,
                    updatedAt: true,
                    deletedAt: true,
                }
            }
        );
    }

    async getAll() {
        const usuarios = await this.prisma.usuario.findMany({
            where: { deletedAt: null },
            omit: this.omit,
            include: {
                usuarioRols: {
                    where: { deletedAt: null },
                    include: {
                        rol: {
                            select: { id: true, nombre: true },
                        },
                    },
                },
            },
        });

        return usuarios.map(({ usuarioRols, ...u }) => ({
            ...u,
            roles: usuarioRols.map((ur) => ur.rol),
        }));
    }

    async create(data) {
        const usuarioExistente = await this.getByEmail(data.email);
        if (usuarioExistente) {
            throw new Error("El correo electrónico ya se encuentra registrado y activo");
        }

        const { rolId, ...restoDatos } = data;
        const datosACrear = { ...restoDatos };

        if (datosACrear.contrasenia) {
            datosACrear.contrasenia = await encriptarContrasena(datosACrear.contrasenia);
        }

        return this.prisma.$transaction(async (tx) => {
            const nuevoUsuario = await tx.usuario.create({
                data: datosACrear,
                omit: this.omit
            });

            if (rolId !== undefined && rolId !== null && rolId !== "") {
                await this.sincronizarRolUsuario(tx, nuevoUsuario.id, rolId);
            }

            return this.obtenerPorIdConRoles(tx, nuevoUsuario.id);
        });
    }

    async update(id, data) {
        const usuarioId = Number(id);

        //aqui solo hice consistencia en como guarda las variables del nuevo usuario
        const datosAActualizar = {};

        if (data.nombre !== undefined) {
            datosAActualizar.nombre = data.nombre;
        }

        if (data.email !== undefined) {
            datosAActualizar.email = data.email;
        }

        if (data.contrasenia) {
            datosAActualizar.contrasenia = await encriptarContrasena(data.contrasenia);
        }

        if (data.fotoUrl !== undefined) {
            datosAActualizar.fotoUrl = data.fotoUrl;
        }

        return this.prisma.$transaction(async (tx) => {
            await tx.usuario.update({
                where: {
                    id: usuarioId,
                },
                data: datosAActualizar,
                omit: this.omit
            });

            if (data.rolId !== undefined) {
                await this.sincronizarRolUsuario(tx, usuarioId, data.rolId);
            }

            return this.obtenerPorIdConRoles(tx, usuarioId);
        });
    }

    async sincronizarRolUsuario(tx, usuarioId, rolId) {
        const idRol = rolId ? Number(rolId) : null;

        await tx.usuarioRol.updateMany({
            where: {
                usuarioId,
                deletedAt: null,
                ...(Number.isInteger(idRol) && idRol > 0 ? { rolId: { not: idRol } } : {}),
            },
            data: {
                deletedAt: new Date(),
            },
        });

        if (Number.isInteger(idRol) && idRol > 0) {
            await tx.usuarioRol.upsert({
                where: {
                    usuarioId_rolId: {
                        usuarioId,
                        rolId: idRol,
                    },
                },
                update: {
                    deletedAt: null,
                },
                create: {
                    usuarioId,
                    rolId: idRol,
                },
            });
        }
    }

    async obtenerPorIdConRoles(tx, id) {
        const usuario = await tx.usuario.findUnique({
            where: { id },
            omit: this.omit,
            include: {
                usuarioRols: {
                    where: { deletedAt: null, rol: { deletedAt: null } },
                    include: {
                        rol: {
                            select: { id: true, nombre: true },
                        },
                    },
                },
            },
        });

        if (!usuario) return null;

        const { usuarioRols, ...u } = usuario;
        return {
            ...u,
            roles: usuarioRols.map((ur) => ur.rol),
        };
    }
    
    async delete(id) {
        const usuarioExistente = await this.getById(id);
        if (!usuarioExistente) {
            throw new Error("El usuario no existe");
        }

        return this.model.update({
            where: {
                id: id,
            },
            data: {
                deletedAt: new Date(),
            },
        });
    }

    async getByEmail(email) {
        return this.prisma.usuario.findFirst({
            where: {
                email: email,
                deletedAt: null,
            },
            omit: this.omit
        });
    }

    async getByCredenciales(email, password) {
        const usuario = await this.prisma.usuario.findFirst({
            where: {
                email: email,
                deletedAt: null,
            },
            include: {
                usuarioRols: {
                    where: { deletedAt: null, rol: { deletedAt: null } },
                    select: {
                        rol: { select: { id: true, nombre: true, descripcion: true } },
                    },
                },
            },
        });

        if (!usuario) {
            return null;
        }

        const esValida = verificarContrasena(password, usuario.contrasenia);

        if (!esValida) {
            return null;
        }

        const { contrasenia, createdAt, updatedAt, deletedAt, usuarioRols, ...usuarioSeguro } = usuario;
        return {
            ...usuarioSeguro,
            roles: usuarioRols.map(({ rol }) => rol),
        };
    }
}

export const usuarioDao = new UsuarioDao();
