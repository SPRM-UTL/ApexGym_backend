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

    async create(data) {
        const usuarioExistente = await this.getByEmail(data.email);
        if (usuarioExistente) {
            throw new Error("El correo electrónico ya se encuentra registrado y activo");
        }

        const datosACrear = { ...data };

        if (datosACrear.contrasenia) {
            datosACrear.contrasenia = await encriptarContrasena(datosACrear.contrasenia);
        }

        return this.model.create({
            data: datosACrear,
            omit: this.omit
        });
    }

    async update(id, data) {
        const datosAActualizar = { ...data };

        if (datosAActualizar.contrasenia) {
            datosAActualizar.contrasenia = await encriptarContrasena(datosAActualizar.contrasenia);
        }

        return this.model.update({
            where: {
                id: id,
            },
            data: datosAActualizar,
            omit: this.omit
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
            }
        });

        if (!usuario) {
            return null;
        }

        const esValida = verificarContrasena(password, usuario.contrasenia);

        if (!esValida) {
            return null;
        }

        const { contrasenia, createdAt, updatedAt, deletedAt, ...usuarioSeguro } = usuario;
        return usuarioSeguro;
    }
}

export const usuarioDao = new UsuarioDao();