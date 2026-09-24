import { usuarioDao } from "../dao/UsuarioDao.js";
import { BaseController } from "./BaseController.js";

export class UsuarioController extends BaseController {
    constructor() {
        super(usuarioDao);
    }

    verificarCredenciales = async (req, res) => {
        const { email, password } = req.body;

        try {
            const usuario = await usuarioDao.getByCredenciales(email, password);
            if (!usuario) {
                throw new Error("Credenciales inválidas");
            }

            return this.respuestaExito(res, usuario, "Credenciales válidas");

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

