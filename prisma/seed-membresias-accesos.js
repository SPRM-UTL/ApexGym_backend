import { prisma } from '../dao/BaseDao.js';

async function seedMembresiasYAccesos() {
    console.log('--- Iniciando Seed de Membresías, Accesos y Beneficios ---');

    // 1. Estados de Membresía esenciales para el semáforo y lógica de negocio
    const estados = [
        { nombre: 'Vigente', descripcion: 'Membresía activa con acceso concedido al gimnasio', color: '#2b8a3e' },
        { nombre: 'Vencida', descripcion: 'Membresía expirada sin acceso permitido', color: '#e03131' },
        { nombre: 'Cancelada', descripcion: 'Membresía suspendida o dada de baja', color: '#868e96' }
    ];

    for (const est of estados) {
        const existente = await prisma.estadoMembresia.findFirst({ where: { nombre: est.nombre } });
        if (!existente) {
            await prisma.estadoMembresia.create({ data: est });
            console.log(`✓ Estado creado: ${est.nombre}`);
        } else {
            await prisma.estadoMembresia.update({
                where: { id: existente.id },
                data: { color: est.color, descripcion: est.descripcion }
            });
            console.log(`✓ Estado sincronizado: ${est.nombre}`);
        }
    }

    // 2. Tipos de Visita para el Drawer de recepción
    const visitas = [
        { nombre: 'Pase por Día', descripcion: 'Acceso general válido por 1 día', costo: 50.00, estado: 'activo' },
        { nombre: 'Pase Semanal', descripcion: 'Acceso temporal de prueba por 7 días', costo: 200.00, estado: 'activo' }
    ];

    for (const vis of visitas) {
        const existente = await prisma.tipoVisita.findFirst({ where: { nombre: vis.nombre } });
        if (!existente) {
            await prisma.tipoVisita.create({ data: vis });
            console.log(`✓ Tipo Visita creado: ${vis.nombre}`);
        }
    }

    // 3. Tipos de Membresía con sus Beneficios para la App Móvil y Recepción
    const planes = [
        {
            nombre: 'Membresía Mensual VIP',
            descripcion: 'Acceso total e ilimitado a todas las instalaciones del gimnasio',
            duracionDias: 30,
            precio: 550.00,
            estado: 'activo',
            beneficios: [
                { titulo: 'Acceso Total a Instalaciones', descripcion: 'Área de pesas, cardio y zona funcional libre', icono: 'fitness_center' },
                { titulo: 'Vestidores y Regaderas', descripcion: 'Lockers de uso diario y regaderas con agua caliente', icono: 'shower' },
                { titulo: 'Pase Virtual QR', descripcion: 'Acceso ágil por torniquete desde la app móvil', icono: 'qr_code_scanner' },
                { titulo: 'Asesoría Nutricional y Rutina', descripcion: 'Evaluación inicial con preparador físico', icono: 'assignment_turned_in' }
            ]
        },
        {
            nombre: 'Membresía Básica',
            descripcion: 'Acceso a área de pesas y cardiovascular en horario regular',
            duracionDias: 30,
            precio: 400.00,
            estado: 'activo',
            beneficios: [
                { titulo: 'Acceso a Pesas y Cardio', descripcion: 'Uso de máquinas y peso libre', icono: 'fitness_center' },
                { titulo: 'Pase Virtual QR', descripcion: 'Acceso ágil por torniquete', icono: 'qr_code_scanner' },
                { titulo: 'Vestidores y Regaderas', descripcion: 'Lockers de uso diario', icono: 'shower' }
            ]
        },
        {
            nombre: 'Membresía Anual Black',
            descripcion: 'Plan anual con beneficios premium y máxima prioridad',
            duracionDias: 365,
            precio: 4800.00,
            estado: 'activo',
            beneficios: [
                { titulo: 'Acceso Ilimitado 365 Días', descripcion: 'Todas las áreas sin restricción de horario', icono: 'fitness_center' },
                { titulo: 'Invitado Mensual', descripcion: 'Pase de cortesía para un amigo cada mes', icono: 'group_add' },
                { titulo: 'Casillero Fijo Exclusivo', descripcion: 'Locker asignado durante todo el año', icono: 'lock' },
                { titulo: 'Descuento en Suplementos', descripcion: '15% de descuento en la tienda de nutrición', icono: 'shopping_bag' }
            ]
        }
    ];

    for (const plan of planes) {
        let tipo = await prisma.tipoMembresia.findFirst({ where: { nombre: plan.nombre } });
        if (!tipo) {
            tipo = await prisma.tipoMembresia.create({
                data: {
                    nombre: plan.nombre,
                    descripcion: plan.descripcion,
                    duracionDias: plan.duracionDias,
                    precio: plan.precio,
                    estado: plan.estado
                }
            });
            console.log(`✓ Tipo Membresía creado: ${plan.nombre}`);
        }

        for (const ben of plan.beneficios) {
            const benExist = await prisma.beneficioMembresia.findFirst({
                where: { tipoMembresiaId: tipo.id, titulo: ben.titulo }
            });
            if (!benExist) {
                await prisma.beneficioMembresia.create({
                    data: {
                        tipoMembresiaId: tipo.id,
                        titulo: ben.titulo,
                        descripcion: ben.descripcion,
                        icono: ben.icono
                    }
                });
            }
        }
    }

    console.log('--- Seed de Membresías y Accesos completado exitosamente ---');
}

seedMembresiasYAccesos()
    .catch((error) => {
        console.error('Error al ejecutar el seeder:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
