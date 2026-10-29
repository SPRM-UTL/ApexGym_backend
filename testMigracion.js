import { prisma } from './dao/BaseDao.js';

const ventas = await prisma.venta.findMany({
  where: { folioVentaId: null },
  orderBy: { id: 'asc' },
});

for (const v of ventas) {
  await prisma.venta.update({
    where: { id: v.id },
    data: { folioVenta: { create: {} } },
  });
}

console.log(`Folios asignados: ${ventas.length}`);
await prisma.$disconnect();