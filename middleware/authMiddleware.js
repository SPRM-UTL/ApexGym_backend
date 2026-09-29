import { tokenDao } from "../dao/TokenDao.js";
import { permisoDao } from "../dao/PermisoDao.js";
import { ResponseModel } from "../modelos/ResponseModel.js";

// ── Autenticación ────────────────────────────────────────────────────────────
/**
 * Verifica que el request tenga un Bearer token válido y no expirado.
 * Inyecta req.usuario y req.token para uso posterior.
 */
export const autenticarUsuario = async (req, res, next) => {

    try {

        const authHeader = req.headers.authorization;

        if (!authHeader) {
            const response = new ResponseModel(null, 1, "Token no proporcionado", 401);
            return res.status(401).json(response);
        }

        const [tipo, token] = authHeader.split(" ");

        if (tipo !== "Bearer" || !token) {
            const response = new ResponseModel(null, 1, "Formato de token inválido", 401);
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

            const response = new ResponseModel(null, 1, mensaje, 401);
            return res.status(401).json(response);
        }

        req.usuario = resultado.token.usuario;
        req.token = resultado.token;

        next();

    } catch (error) {

        console.error("Error en autenticación:", error);
        const response = new ResponseModel(null, 1, error.message || "Error al validar el token", 500);
        return res.status(500).json(response);
    }
};

// ── Autorización ─────────────────────────────────────────────────────────────
/**
 * Factory que devuelve un middleware que verifica si el usuario autenticado
 * tiene el permiso requerido (módulo + acción + método HTTP).
 *
 * Debe usarse DESPUÉS de autenticarUsuario.
 *
 * @param {string} modulo  - Nombre del módulo en BD, ej: "Usuarios"
 * @param {string} accion  - Nombre de la acción en BD, ej: "Listar"
 *
 * El método HTTP se toma automáticamente de req.method.
 */
export const verificarPermiso = (modulo, accion) => async (req, res, next) => {

    try {

        const usuarioId = req.usuario?.id;

        if (!usuarioId) {
            const response = new ResponseModel(null, 1, "Usuario no autenticado", 401);
            return res.status(401).json(response);
        }

        const metodo = req.method.toUpperCase();
        const tiene = await permisoDao.tienePermiso(usuarioId, modulo, accion, metodo);

        if (!tiene) {
            const response = new ResponseModel(
                null,
                1,
                `No tienes permiso para realizar esta acción (${accion} ${modulo})`,
                403
            );
            return res.status(403).json(response);
        }

        next();

    } catch (error) {

        console.error("Error al verificar permiso:", error);
        const response = new ResponseModel(null, 1, error.message || "Error al verificar permisos", 500);
        return res.status(500).json(response);
    }
};