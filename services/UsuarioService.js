import { usuarioDao } from "../dao/UsuarioDao.js";
import { tokenDao } from "../dao/TokenDao.js";
import { eliminarArchivoSubido } from "../middleware/uploadMiddleware.js";

export class UsuarioService {

    constructor() {
        this.dao = usuarioDao;
    }

    verificarCredenciales = async (data) => {
        const { email, contrasenia } = data;

        const usuario = await this.dao.getByCredenciales(email, contrasenia);

        if (!usuario) {
            throw new Error("Credenciales inválidas");
        }

        const token = await tokenDao.crearTokenSesion(usuario.id);

        return {
            usuario,
            token
        };
    };

    cerrarSesion = async (tokenStr) => {
        if (tokenStr) {
            await tokenDao.revocarToken(tokenStr);
            //await tokenDao.revocarOtrosTokensSesion(usuarioId, tokenStr)
        }

        return true;
    };

    registrarUsuario = async (data) => {
        const { nombre, email, contrasenia, rolId, fotoUrl } = data;

        try {
            const datos = {
                nombre,
                email,
                contrasenia,
                rolId
            };

            if (fotoUrl) {
                datos.fotoUrl = fotoUrl;
            }

            return await this.dao.create(datos);

        } catch (error) {
            if (fotoUrl) {
                eliminarArchivoSubido(fotoUrl);
            }

            throw error;
        }
    };

    actualizarUsuario = async (id, data) => {
        const { nombre, email, contrasenia, rolId, nuevaFotoUrl } = data;

        console.log("Foto service: " + nuevaFotoUrl)

        try {
            const usuarioId = Number(id);

            const usuarioPrevio = nuevaFotoUrl
                ? await this.dao.getById(usuarioId)
                : null;

            const datos = {
                nombre,
                email,
                contrasenia,
                rolId
            };

            if (nuevaFotoUrl !== undefined) {
                datos.fotoUrl = nuevaFotoUrl;
            }

            const nuevoUsuario = await this.dao.update(usuarioId, datos);

            if (
                nuevaFotoUrl &&
                usuarioPrevio?.fotoUrl &&
                usuarioPrevio.fotoUrl !== nuevaFotoUrl
            ) {
                eliminarArchivoSubido(usuarioPrevio.fotoUrl);
            }

            return nuevoUsuario;

        } catch (error) {
            if (nuevaFotoUrl) {
                eliminarArchivoSubido(nuevaFotoUrl);
            }

            throw error;
        }
    };

    eliminarUsuario = async (id) => {
        return await this.dao.delete(Number(id));
    };
}

export const usuarioService = new UsuarioService();