import crypto from "node:crypto";
import { BaseDao } from "./BaseDao.js";

export class TokenDao extends BaseDao {

    constructor() {
        super("token");
    }

    async crearTokenSesion(usuarioId, tiempoVida = 86400) {

        const token = crypto.randomUUID();

        return this.model.create({
            data: {
                usuarioId,
                tipoToken: "TOKEN_SESION",
                token,
                tiempoVida
            },
            include: {
                usuario: true
            }
        });
    }

    async obtenerToken(token) {
        return this.model.findUnique({
            where: {
                token
            },
            include: {
                usuario: true
            }
        });
    }

    async obtenerTokenSesion(token) {
        const tokenDB = await this.obtenerToken(token);

        if (!tokenDB) {
            return null;
        }

        if (tokenDB.tipoToken !== "TOKEN_SESION") {
            return null;
        }

        return tokenDB;
    }

    estaExpirado(tokenDB) {

        if (tokenDB.tiempoVida === -1) {
            return false;
        }

        const fechaExpiracion =
            new Date(tokenDB.createdAt).getTime() +
            (tokenDB.tiempoVida * 1000);

        return Date.now() >= fechaExpiracion;
    }

    estaRevocado(tokenDB) {
        return tokenDB.deletedAt !== null;
    }

    async validarTokenSesion(token) {

        const tokenDB = await this.obtenerTokenSesion(token);

        if (!tokenDB) {
            return {
                valido: false,
                motivo: "TOKEN_INVALIDO",
                token: null
            };
        }

        if (this.estaRevocado(tokenDB)) {
            return {
                valido: false,
                motivo: "TOKEN_REVOCADO",
                token: tokenDB
            };
        }

        if (this.estaExpirado(tokenDB)) {

            await this.revocarToken(token);

            return {
                valido: false,
                motivo: "TOKEN_EXPIRADO",
                token: tokenDB
            };
        }

        return {
            valido: true,
            motivo: null,
            token: tokenDB
        };
    }

    async revocarToken(token) {
        return this.model.update({
            where: {
                token
            },
            data: {
                deletedAt: new Date()
            }
        });
    }

    async revocarTokensSesionUsuario(usuarioId) {
        return this.model.updateMany({
            where: {
                usuarioId,
                tipoToken: "TOKEN_SESION",
                deletedAt: null
            },
            data: {
                deletedAt: new Date()
            }
        });
    }

    async revocarOtrosTokensSesion(usuarioId, tokenActual) {
        return this.model.updateMany({
            where: {
                usuarioId,
                tipoToken: "TOKEN_SESION",
                token: {
                    not: tokenActual
                },
                deletedAt: null
            },
            data: {
                deletedAt: new Date()
            }
        });
    }
}

export const tokenDao = new TokenDao();