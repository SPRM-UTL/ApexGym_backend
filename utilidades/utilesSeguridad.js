import bcrypt from 'bcrypt';

export function encriptarContrasena(contrasena) {
    const saltRounds = 10;
    const salt = bcrypt.genSaltSync(saltRounds);
    const hash = bcrypt.hashSync(contrasena, salt);
    return hash;
}

export function verificarContrasena(contrasena, hash) {
    return bcrypt.compareSync(contrasena, hash);
}