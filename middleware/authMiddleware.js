import { tokenDao } from "../dao/TokenDao.js";
import { ResponseModel } from "../modelos/ResponseModel.js";

export const autenticarUsuario = async (req, res, next) => {

    try {

        const authHeader = req.headers.authorization;

        if (!authHeader) {
            const response = new ResponseModel(
                null,
                1,
                "Token no proporcionado",
                401
            );

            return res.status(401).json(response);
        }

        const [tipo, token] = authHeader.split(" ");

        if (tipo !== "Bearer" || !token) {
            const response = new ResponseModel(
                null,
                1,
                "Formato de token inválido",
                401
            );

            return res.status(401).json(response);
        }

        const resultado = await tokenDao.validarTokenSesion(token);

        if (!resultado.valido) {

            let mensaje = "Token inválido";

            switch (resultado.motivo) {

                case "TOKEN_REVOCADO":
                    mensaje = "Token revocado";
                    break;

                case "TOKEN_EXPIRADO":
                    mensaje = "Token expirado";
                    break;

                case "TOKEN_INVALIDO":
                    mensaje = "Token inválido";
                    break;
            }

            const response = new ResponseModel(
                null,
                1,
                mensaje,
                401
            );

            return res.status(401).json(response);
        }

        req.usuario = resultado.token.usuario;
        req.token = resultado.token;

        next();

    } catch (error) {

        console.error("Error en autenticación:", error);

        const response = new ResponseModel(
            null,
            1,
            error.message || "Error al validar el token",
            500
        );

        return res.status(500).json(response);
    }
};