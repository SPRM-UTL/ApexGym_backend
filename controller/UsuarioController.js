import { usuarioDao } from "../dao/UsuarioDao.js";
import { tokenDao } from "../dao/TokenDao.js";
import { BaseController } from "./BaseController.js";
import { eliminarArchivoSubido } from "../middleware/uploadMiddleware.js";
import { usuarioService } from "../services/UsuarioService.js";

export class UsuarioController extends BaseController {
    constructor() {
        super(usuarioDao);
    }

    verificarCredenciales = async (req, res) => {
        try {
            const { usuario, token, checkbox } = await usuarioService.verificarCredenciales(req.body);
            if (!usuario) {
                throw new Error("Credenciales inválidas");
            }

            //librerias instaladas cookie-parser y helmet
            //usamos las cookies httpOnly esto hace que no sea accesible desde ningun codigo de cliente evitando que el frontend vea el token
            //de esta manera evitamos que nuestro tokeen codificado con Base64 lo pueda ver cualquier persona a pesar de estar codificado
            const opcionesCookies = {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',

                /**Perdon ya vi por que se quitaba tan repido la session es por que aqui cuenta por milisegundos ya lo cambie Perdon   😅*/
            }

            if (checkbox == true) {
                opcionesCookies.maxAge = token.registro.tiempoVida * 1000;
            }
            res.cookie('token', token.token, opcionesCookies)
            return this.respuestaExito(

                res,
                {
                    usuario
                },
                "Credenciales válidas"
            );
        } catch (error) {
            return this.respuestaError(res, error);
        }
    }

    logout = async (req, res) => {
        try {
            await usuarioService.cerrarSesion(req.cookies?.token);

            res.clearCookie('token', {
                httpOnly: true,
                secure: process.env.NODE_ENV,
                sameSite: 'strict'
            })
            return this.respuestaExito(res, null, "Sesion cerrada correctamente")

        } catch (error) {
            return this.respuestaError(res, error)
        }
    }
    registrarUsuario = async (req, res) => {
        try {

            const fotoUrl = req.file ? `/uploads/usuarios/${req.file.filename}` : null;
            const nuevoUsuario = await usuarioService.registrarUsuario({ ...req.body, fotoUrl });

            return this.respuestaExito(
                res,
                nuevoUsuario,
                "Usuario registrado exitosamente"
            );
        } catch (error) {
            if (fotoUrl) {
                eliminarArchivoSubido(fotoUrl);
            }
            return this.respuestaError(res, error);
        }
    }

    actualizarUsuario = async (req, res) => {
        const nuevaFotoUrl = req.file
                ? `/uploads/usuarios/${req.file.filename}`
                : undefined;
        console.log("Foto: " + nuevaFotoUrl);
        try {
             
            const nuevoUsuario = await usuarioService.actualizarUsuario(
                req.body.id,
                {
                    ...req.body,
                    nuevaFotoUrl
                }
            );

            return this.respuestaExito(
                res,
                nuevoUsuario,
                "Usuario actualizado exitosamente"
            );
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
            const eliminarUsuario = await usuarioService.eliminarUsuario(id);
            return this.respuestaExito(res, eliminarUsuario, "Usuario eliminado exitosamente");
        } catch (error) {
            return this.respuestaError(res, error);
        }
    }
}

