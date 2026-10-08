import 'dotenv/config';
import { usuarioDao } from '../dao/UsuarioDao.js';
import { prisma } from '../dao/BaseDao.js';

async function createUser() {
    const email = 'bear.oso2001@gmail.com';
    const nombre = 'Emmanuelle';
    const contrasenia = 'Grizzly01';

    console.log(`Buscando si existe usuario con email ${email}...`);
    let usuario = await prisma.usuario.findFirst({
        where: { email }
    });

    if (!usuario) {
        console.log("Creando usuario...");
        usuario = await usuarioDao.create({
            nombre,
            email,
            contrasenia
        });
        console.log("Usuario creado:", usuario);
    } else {
        console.log("El usuario ya existía con ID:", usuario.id);
    }

    // Buscar rol Administrador
    const rolAdmin = await prisma.rol.findFirst({
        where: { nombre: 'Administrador' }
    });

    if (rolAdmin) {
        console.log(`Asignando rol Administrador (ID ${rolAdmin.id}) al usuario ID ${usuario.id}...`);
        await prisma.usuarioRol.upsert({
            where: { usuarioId_rolId: { usuarioId: usuario.id, rolId: rolAdmin.id } },
            update: { deletedAt: null },
            create: { usuarioId: usuario.id, rolId: rolAdmin.id }
        });
        console.log("Rol Administrador asignado con éxito.");
    } else {
        console.log("No se encontró el rol Administrador. Ejecute el seeder.");
    }

    process.exit(0);
}

createUser().catch(err => {
    console.error("Error al crear usuario:", err);
    process.exit(1);
});
