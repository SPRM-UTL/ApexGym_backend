import { usuarioDao } from "../dao/UsuarioDao.js";
import { tokenDao } from "../dao/TokenDao.js";
import { BaseController } from "./BaseController.js";

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
        const { nombre, email, contrasenia } = req.body;
        try {
            const nuevoUsuario = await usuarioDao.create({ nombre, email, contrasenia });
            return this.respuestaExito(res, nuevoUsuario, "Usuario registrado exitosamente");
        } catch (error) {
            return this.respuestaError(res, error);
        }
    }
}

