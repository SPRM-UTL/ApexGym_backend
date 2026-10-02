import { usuarioDao } from "../dao/UsuarioDao.js";
import { tokenDao } from "../dao/TokenDao.js";
import { BaseController } from "./BaseController.js";
import { eliminarArchivoSubido } from "../middleware/uploadMiddleware.js";

export class UsuarioController extends BaseController {
    constructor() {
        super(usuarioDao);
    }

    verificarCredenciales = async (req, res) => {
        const { email, contrasenia } = req.body;

        try {
            const usuario = await usuarioDao.getByCredenciales(email, contrasenia);
            if (!usuario) {
                throw new Error("Credenciales inválidas");
            }

            const token = await tokenDao.crearTokenSesion(usuario.id);

            //librerias instaladas cookie-parser y helmet
            //usamos las cookies httpOnly esto hace que no sea accesible desde ningun codigo de cliente evitando que el frontend vea el token
            //de esta manera evitamos que nuestro tokeen codificado con Base64 lo pueda ver cualquier persona a pesar de estar codificado
            res.cookie('token', token.token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
                maxAge: token.tiempoVida
            });

            return this.respuestaExito(
                res,
                {
                    usuario,
                    token: token.token
                },
                "Credenciales válidas"
            );
        } catch (error) {
            return this.respuestaError(res, error);
        }
    }

    registrarUsuario = async (req, res) => {
        const { nombre, email, contrasenia, rolId } = req.body;
        const fotoUrl = req.file ? `/uploads/usuarios/${req.file.filename}` : null;

        try {
            const datos = { nombre, email, contrasenia, rolId };
            if (fotoUrl) {
                datos.fotoUrl = fotoUrl;
            }
            const nuevoUsuario = await usuarioDao.create(datos);
            return this.respuestaExito(res, nuevoUsuario, "Usuario registrado exitosamente");
        } catch (error) {
            if (fotoUrl) {
                eliminarArchivoSubido(fotoUrl);
            }
            return this.respuestaError(res, error);
        }
    }
    
    actualizarUsuario = async (req, res) => {
        const { id, nombre, email, contrasenia, rolId } = req.body;
        const nuevaFotoUrl = req.file ? `/uploads/usuarios/${req.file.filename}` : undefined;

        try {
            const usuarioId = Number(id);
            const usuarioPrevio = nuevaFotoUrl ? await usuarioDao.getById(usuarioId) : null;

            const datos = { nombre, email, contrasenia, rolId };
            if (nuevaFotoUrl !== undefined) {
                datos.fotoUrl = nuevaFotoUrl;
            }

            const nuevoUsuario = await usuarioDao.update(usuarioId, datos);

            if (nuevaFotoUrl && usuarioPrevio?.fotoUrl && usuarioPrevio.fotoUrl !== nuevaFotoUrl) {
                eliminarArchivoSubido(usuarioPrevio.fotoUrl);
            }

            return this.respuestaExito(res, nuevoUsuario, "Usuario actualizado exitosamente");
        } catch (error) {
            if (nuevaFotoUrl) {
                eliminarArchivoSubido(nuevaFotoUrl);
            }
            return this.respuestaError(res, error);
        }
    }
    
    eliminarUsuario = async (req, res) => {
        const { id } = req.body;
        try {
            const eliminarUsuario = await usuarioDao.delete(id);
            return this.respuestaExito(res, eliminarUsuario, "Usuario eliminado exitosamente");
        } catch (error) {
            return this.respuestaError(res, error);
        }
    }
}

