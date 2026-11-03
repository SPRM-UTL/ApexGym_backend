import { clienteService } from '../services/ClienteService.js';
import { usuarioService } from '../services/UsuarioService.js';
import { BaseController } from './BaseController.js';

export class RegistroClienteController extends BaseController {

    registrarCliente = async (req, res) => {
        try {
            const usuario = await usuarioService.registrarUsuario(req.body);

            const cliente = await clienteService.crear({
                ...req.body,
                usuarioId: usuario.id
            });

            const { token } = await usuarioService.verificarCredenciales({
                email: req.body.email,
                contrasenia: req.body.contrasenia
            });

            //token y cookies
            const opcionesCookies = {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
            }
            opcionesCookies.maxAge = token.registro.tiempoVida * 1000;
            res.cookie('token', token.token, opcionesCookies)

            return this.respuestaExito(
                res,
                {
                    usuario,
                    cliente
                },
                "Cliente registrado e identificado correctamente"
            );

        } catch (error) {
            return this.respuestaError(res, error);
        }
    };
}