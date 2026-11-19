import { usuarioDao } from "../dao/UsuarioDao.js";
import { tokenDao } from "../dao/TokenDao.js";
import { eliminarImagen } from "../middleware/uploadMiddleware.js";

export class UsuarioService {

    constructor() {
        this.dao = usuarioDao;
    }

    verificarCredenciales = async (data) => {
        const { email, contrasenia, checkbox } = data;

        const usuario = await this.dao.getByCredenciales(email, contrasenia);

        if (!usuario) {
            throw new Error("Credenciales inválidas");
        }

        const token = await tokenDao.crearTokenSesion(usuario.id);

        return {
            usuario,
            token,
            checkbox
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
        const { nombre, email, contrasenia, rolId, fotoUrl, imagenSubida } = data;

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
            let errorFinal = error;
            if (imagenSubida) {
                try {
                    await eliminarImagen('usuarios', imagenSubida);
                } catch (errorLimpieza) {
                    console.error('[Usuarios] No se pudo limpiar la imagen subida:', errorLimpieza);
                    errorFinal = new Error(
                        `${error instanceof Error ? error.message : String(error)}. No se pudo limpiar la imagen subida: ${errorLimpieza.message}`
                    );
                }
            }

            throw errorFinal;
        }
    };

    actualizarUsuario = async (id, data) => {
        const { nombre, email, contrasenia, rolId, nuevaImagen } = data;

        try {
            const usuarioId = Number(id);

            const usuarioPrevio = nuevaImagen
                ? await this.dao.getById(usuarioId)
                : null;

            const datos = {
                nombre,
                email,
                contrasenia,
                rolId
            };

            if (nuevaImagen) {
                datos.fotoUrl = nuevaImagen.url;
            }

            const nuevoUsuario = await this.dao.update(usuarioId, datos);

            if (
                nuevaImagen &&
                usuarioPrevio?.fotoUrl &&
                usuarioPrevio.fotoUrl !== nuevaImagen.url
            ) {
                try {
                    await eliminarImagen('usuarios', { url: usuarioPrevio.fotoUrl });
                } catch (errorLimpieza) {
                    console.error(`[Usuarios] No se pudo eliminar la foto anterior del usuario ${usuarioId}:`, errorLimpieza);
                }
            }

            return nuevoUsuario;

        } catch (error) {
            let errorFinal = error;
            if (nuevaImagen) {
                try {
                    await eliminarImagen('usuarios', nuevaImagen);
                } catch (errorLimpieza) {
                    console.error('[Usuarios] No se pudo limpiar la nueva foto subida:', errorLimpieza);
                    errorFinal = new Error(
                        `${error instanceof Error ? error.message : String(error)}. No se pudo limpiar la nueva foto: ${errorLimpieza.message}`
                    );
                }
            }

            throw errorFinal;
        }
    };

    eliminarUsuario = async (id) => {
        return await this.dao.delete(Number(id));
    };
}

export const usuarioService = new UsuarioService();
