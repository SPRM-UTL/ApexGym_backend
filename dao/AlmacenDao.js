import { BaseDao, prisma } from './BaseDao.js';

function crearErrorAlmacen(mensaje, status = 400) {
    const error = new Error(mensaje);
    error.status = status;
    return error;
}

function resumirAlmacen(almacen) {
    const { inventarios = [], ...resto } = almacen;
    const totalProductos = inventarios.length;
    const productosConStock = inventarios.filter((inv) => Number(inv.stockActual ?? 0) > 0).length;
    const totalUnidades = inventarios.reduce((acc, inv) => acc + Number(inv.stockActual ?? 0), 0);
    const productosStockBajo = inventarios.filter(
        (inv) => Number(inv.stockActual ?? 0) <= Number(inv.stockMinimo ?? 1)
    ).length;

    return {
        ...resto,
        totalProductos,
        productosConStock,
        totalUnidades,
        productosStockBajo,
    };
}

export class AlmacenDao extends BaseDao {
    constructor({ prismaClient = prisma } = {}) {
        super('almacen', {
            omit: {
                updatedAt: true,
                deletedAt: true,
            },
        });
        this.prisma = prismaClient;
        this.model = prismaClient.almacen;
    }

    resolverContextoSucursal(empresaId, sucursalId) {
        const empId = this.resolverEmpresaId(empresaId);
        if (sucursalId === 'todas' || sucursalId === null) {
            return { empresaId: empId, sucursalId: null };
        }
        return {
            empresaId: empId,
            sucursalId: this.resolverSucursalId(sucursalId),
        };
    }

    async asegurarAlmacenPrincipal(empresaId, sucursalId, tx = this.prisma) {
        const empId = this.resolverEmpresaId(empresaId);
        const sucId = this.resolverSucursalId(sucursalId) ?? 1;

        const principalExistente = await tx.almacen.findFirst({
            where: {
                empresaId: empId,
                sucursalId: sucId,
                esPrincipal: true,
                deletedAt: null,
            },
            orderBy: { id: 'asc' },
        });
        if (principalExistente) {
            return principalExistente;
        }

        const primeroExistente = await tx.almacen.findFirst({
            where: {
                empresaId: empId,
                sucursalId: sucId,
                deletedAt: null,
            },
            orderBy: { id: 'asc' },
        });
        if (primeroExistente) {
            return tx.almacen.update({
                where: { id: primeroExistente.id },
                data: { esPrincipal: true, activo: true },
            });
        }

        return tx.almacen.upsert({
            where: {
                empresaId_sucursalId_nombre: {
                    empresaId: empId,
                    sucursalId: sucId,
                    nombre: 'Almacén Principal',
                },
            },
            update: {
                esPrincipal: true,
                activo: true,
                deletedAt: null,
            },
            create: {
                empresaId: empId,
                sucursalId: sucId,
                nombre: 'Almacén Principal',
                codigo: 'ALM-01',
                tipo: 'PRINCIPAL',
                ubicacion: 'Mostrador principal',
                esPrincipal: true,
                activo: true,
            },
        });
    }

    async obtenerPorSucursal(empresaId, sucursalId) {
        const ctx = this.resolverContextoSucursal(empresaId, sucursalId);

        if (ctx.sucursalId !== null) {
            await this.asegurarAlmacenPrincipal(ctx.empresaId, ctx.sucursalId);
        }

        const almacenes = await this.prisma.almacen.findMany({
            where: {
                empresaId: ctx.empresaId,
                ...(ctx.sucursalId !== null ? { sucursalId: ctx.sucursalId } : {}),
                deletedAt: null,
            },
            orderBy: [{ esPrincipal: 'desc' }, { nombre: 'asc' }, { id: 'asc' }],
            omit: this.omit,
            include: {
                sucursal: {
                    select: { id: true, nombre: true, codigo: true },
                },
                inventarios: {
                    where: {
                        deletedAt: null,
                        producto: { deletedAt: null },
                    },
                    select: {
                        id: true,
                        productoId: true,
                        stockActual: true,
                        stockMinimo: true,
                    },
                },
            },
        });

        return almacenes.map(resumirAlmacen);
    }

    async obtenerPorId(id, empresaId, sucursalId) {
        const ctx = this.resolverContextoSucursal(empresaId, sucursalId);
        const almacen = await this.prisma.almacen.findFirst({
            where: {
                id: Number(id),
                empresaId: ctx.empresaId,
                ...(ctx.sucursalId !== null ? { sucursalId: ctx.sucursalId } : {}),
                deletedAt: null,
            },
            omit: this.omit,
            include: {
                sucursal: {
                    select: { id: true, nombre: true, codigo: true },
                },
                inventarios: {
                    where: {
                        deletedAt: null,
                        producto: { deletedAt: null },
                    },
                    select: {
                        id: true,
                        productoId: true,
                        stockActual: true,
                        stockMinimo: true,
                    },
                },
            },
        });
        return almacen ? resumirAlmacen(almacen) : null;
    }

    async crear({
        empresaId,
        sucursalId,
        nombre,
        codigo = null,
        tipo = null,
        ubicacion = null,
        esPrincipal = false,
        activo = true,
    }) {
        const empId = this.resolverEmpresaId(empresaId);
        const sucId = sucursalId === 'todas' || sucursalId === null
            ? 1
            : this.resolverSucursalId(sucursalId);
        const nombreLimpio = typeof nombre === 'string' ? nombre.trim() : '';
        if (!nombreLimpio || nombreLimpio.length > 120) {
            throw crearErrorAlmacen('El nombre del almacén es obligatorio y no debe exceder 120 caracteres', 400);
        }

        const codigoLimpio = typeof codigo === 'string' && codigo.trim() ? codigo.trim().slice(0, 40) : null;
        const tipoLimpio = typeof tipo === 'string' && tipo.trim()
            ? tipo.trim().toUpperCase().slice(0, 40)
            : (esPrincipal ? 'PRINCIPAL' : 'BODEGA');
        const ubicacionLimpia = typeof ubicacion === 'string' && ubicacion.trim()
            ? ubicacion.trim().slice(0, 200)
            : null;
        const marcarPrincipal = Boolean(esPrincipal);
        const estaActivo = marcarPrincipal ? true : Boolean(activo);

        return this.prisma.$transaction(async (tx) => {
            const sucursal = await tx.sucursal.findFirst({
                where: { id: sucId, empresaId: empId, deletedAt: null },
                select: { id: true },
            });
            if (!sucursal) {
                throw crearErrorAlmacen('La sucursal especificada no existe o está inactiva', 404);
            }

            await this.asegurarAlmacenPrincipal(empId, sucId, tx);

            const existente = await tx.almacen.findUnique({
                where: {
                    empresaId_sucursalId_nombre: {
                        empresaId: empId,
                        sucursalId: sucId,
                        nombre: nombreLimpio,
                    },
                },
            });

            if (existente && existente.deletedAt === null) {
                throw crearErrorAlmacen(`Ya existe un almacén llamado "${nombreLimpio}" en esta sucursal`, 409);
            }

            if (marcarPrincipal) {
                await tx.almacen.updateMany({
                    where: { empresaId: empId, sucursalId: sucId, esPrincipal: true, deletedAt: null },
                    data: { esPrincipal: false },
                });
            }

            const creado = existente
                ? await tx.almacen.update({
                    where: { id: existente.id },
                    data: {
                        codigo: codigoLimpio,
                        tipo: tipoLimpio,
                        ubicacion: ubicacionLimpia,
                        esPrincipal: marcarPrincipal,
                        activo: estaActivo,
                        deletedAt: null,
                    },
                    omit: this.omit,
                })
                : await tx.almacen.create({
                    data: {
                        empresaId: empId,
                        sucursalId: sucId,
                        nombre: nombreLimpio,
                        codigo: codigoLimpio,
                        tipo: tipoLimpio,
                        ubicacion: ubicacionLimpia,
                        esPrincipal: marcarPrincipal,
                        activo: estaActivo,
                    },
                    omit: this.omit,
                });

            return {
                ...creado,
                totalProductos: 0,
                productosConStock: 0,
                totalUnidades: 0,
                productosStockBajo: 0,
            };
        });
    }

    async actualizar(id, {
        empresaId,
        sucursalId,
        nombre,
        codigo,
        tipo,
        ubicacion,
        esPrincipal,
        activo,
    }) {
        const almacenId = Number(id);
        const ctx = this.resolverContextoSucursal(empresaId, sucursalId);

        return this.prisma.$transaction(async (tx) => {
            const existente = await tx.almacen.findFirst({
                where: {
                    id: almacenId,
                    empresaId: ctx.empresaId,
                    ...(ctx.sucursalId !== null ? { sucursalId: ctx.sucursalId } : {}),
                    deletedAt: null,
                },
            });
            if (!existente) {
                throw crearErrorAlmacen('Almacén no encontrado', 404);
            }

            const datos = {};
            if (nombre !== undefined) {
                const nombreLimpio = typeof nombre === 'string' ? nombre.trim() : '';
                if (!nombreLimpio || nombreLimpio.length > 120) {
                    throw crearErrorAlmacen('El nombre del almacén es obligatorio y no debe exceder 120 caracteres', 400);
                }
                if (nombreLimpio !== existente.nombre) {
                    const duplicado = await tx.almacen.findFirst({
                        where: {
                            empresaId: existente.empresaId,
                            sucursalId: existente.sucursalId,
                            nombre: nombreLimpio,
                            id: { not: existente.id },
                            deletedAt: null,
                        },
                        select: { id: true },
                    });
                    if (duplicado) {
                        throw crearErrorAlmacen(`Ya existe otro almacén llamado "${nombreLimpio}" en esta sucursal`, 409);
                    }
                }
                datos.nombre = nombreLimpio;
            }

            if (codigo !== undefined) {
                datos.codigo = typeof codigo === 'string' && codigo.trim() ? codigo.trim().slice(0, 40) : null;
            }
            if (tipo !== undefined) {
                datos.tipo = typeof tipo === 'string' && tipo.trim()
                    ? tipo.trim().toUpperCase().slice(0, 40)
                    : existente.tipo;
            }
            if (ubicacion !== undefined) {
                datos.ubicacion = typeof ubicacion === 'string' && ubicacion.trim()
                    ? ubicacion.trim().slice(0, 200)
                    : null;
            }

            if (esPrincipal === false && existente.esPrincipal) {
                const otroPrincipal = await tx.almacen.findFirst({
                    where: {
                        empresaId: existente.empresaId,
                        sucursalId: existente.sucursalId,
                        esPrincipal: true,
                        id: { not: existente.id },
                        deletedAt: null,
                    },
                    select: { id: true },
                });
                if (!otroPrincipal) {
                    throw crearErrorAlmacen(
                        'Debe existir al menos un almacén principal en la sucursal. Marca otro almacén como principal primero.',
                        400
                    );
                }
                datos.esPrincipal = false;
            } else if (esPrincipal === true) {
                await tx.almacen.updateMany({
                    where: {
                        empresaId: existente.empresaId,
                        sucursalId: existente.sucursalId,
                        id: { not: existente.id },
                        esPrincipal: true,
                        deletedAt: null,
                    },
                    data: { esPrincipal: false },
                });
                datos.esPrincipal = true;
                datos.activo = true;
            }

            if (activo !== undefined && datos.esPrincipal !== true) {
                const nuevoActivo = Boolean(activo);
                if (!nuevoActivo && existente.esPrincipal && datos.esPrincipal !== false) {
                    throw crearErrorAlmacen(
                        'No puedes desactivar el almacén principal sin asignar otro almacén como principal.',
                        400
                    );
                }
                datos.activo = nuevoActivo;
            }

            const actualizado = await tx.almacen.update({
                where: { id: existente.id },
                data: datos,
                omit: this.omit,
                include: {
                    sucursal: { select: { id: true, nombre: true, codigo: true } },
                    inventarios: {
                        where: { deletedAt: null, producto: { deletedAt: null } },
                        select: { id: true, productoId: true, stockActual: true, stockMinimo: true },
                    },
                },
            });

            if (datos.activo !== undefined && datos.activo !== existente.activo) {
                const productosAfectados = await tx.inventarioAlmacen.findMany({
                    where: { almacenId: existente.id, deletedAt: null },
                    select: { productoId: true },
                });
                for (const item of productosAfectados) {
                    await this.recalcularStockProductoEnTx(tx, item.productoId);
                }
            }

            return resumirAlmacen(actualizado);
        });
    }

    async eliminar(id, { empresaId, sucursalId } = {}) {
        const almacenId = Number(id);
        const ctx = this.resolverContextoSucursal(empresaId, sucursalId);

        return this.prisma.$transaction(async (tx) => {
            const existente = await tx.almacen.findFirst({
                where: {
                    id: almacenId,
                    empresaId: ctx.empresaId,
                    ...(ctx.sucursalId !== null ? { sucursalId: ctx.sucursalId } : {}),
                    deletedAt: null,
                },
            });
            if (!existente) {
                throw crearErrorAlmacen('Almacén no encontrado', 404);
            }

            if (existente.esPrincipal) {
                const otroPrincipal = await tx.almacen.findFirst({
                    where: {
                        empresaId: existente.empresaId,
                        sucursalId: existente.sucursalId,
                        esPrincipal: true,
                        id: { not: existente.id },
                        deletedAt: null,
                    },
                    select: { id: true },
                });
                if (!otroPrincipal) {
                    throw crearErrorAlmacen(
                        'No se puede eliminar el único almacén principal de la sucursal. Designa otro como principal primero.',
                        409
                    );
                }
            }

            const stockConExistencias = await tx.inventarioAlmacen.findFirst({
                where: {
                    almacenId: existente.id,
                    deletedAt: null,
                    stockActual: { gt: 0 },
                    producto: { deletedAt: null },
                },
                select: { id: true, stockActual: true },
            });

            if (stockConExistencias) {
                throw crearErrorAlmacen(
                    'No puedes eliminar un almacén con existencias mayores a 0. Transfiere el stock a otro almacén primero.',
                    409
                );
            }

            const ahora = new Date();
            await tx.inventarioAlmacen.updateMany({
                where: { almacenId: existente.id, deletedAt: null },
                data: { deletedAt: ahora },
            });

            return tx.almacen.update({
                where: { id: existente.id },
                data: { deletedAt: ahora, activo: false, esPrincipal: false },
                omit: this.omit,
            });
        });
    }

    async obtenerInventario(almacenId, empresaId, sucursalId) {
        const idAlmacen = Number(almacenId);
        const ctx = this.resolverContextoSucursal(empresaId, sucursalId);

        const almacen = await this.prisma.almacen.findFirst({
            where: {
                id: idAlmacen,
                empresaId: ctx.empresaId,
                ...(ctx.sucursalId !== null ? { sucursalId: ctx.sucursalId } : {}),
                deletedAt: null,
            },
            omit: this.omit,
            include: {
                sucursal: { select: { id: true, nombre: true, codigo: true } },
            },
        });

        if (!almacen) {
            throw crearErrorAlmacen('Almacén no encontrado', 404);
        }

        const productos = await this.prisma.producto.findMany({
            where: {
                empresaId: almacen.empresaId,
                sucursalId: almacen.sucursalId,
                deletedAt: null,
            },
            orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
            include: {
                categoria: { select: { id: true, nombre: true } },
                inventariosAlmacen: {
                    where: {
                        almacenId: almacen.id,
                        deletedAt: null,
                    },
                    take: 1,
                },
            },
        });

        const inventario = productos.map((prod) => {
            const fila = prod.inventariosAlmacen[0] ?? null;
            return {
                id: prod.id,
                productoId: prod.id,
                almacenId: almacen.id,
                nombre: prod.nombre,
                codigoBarras: prod.codigoBarras,
                categoriaId: prod.categoriaProductoId,
                categoria: prod.categoria?.nombre ?? 'Sin categoría',
                precioVenta: prod.precioVenta,
                precioCompra: prod.precioCompra,
                stockGlobal: prod.stockActual,
                stockActual: fila ? fila.stockActual : 0,
                stockMinimo: fila ? fila.stockMinimo : (prod.stockMinimo ?? 1),
                ubicacionEstante: fila?.ubicacionEstante ?? null,
                estado: prod.estado,
                disponibleCompra: prod.disponibleCompra,
                imagenUrl: prod.imagenUrl,
            };
        });

        return {
            almacen,
            productos: inventario,
        };
    }

    async recalcularStockProductoEnTx(tx, productoId) {
        const agregado = await tx.inventarioAlmacen.aggregate({
            _sum: { stockActual: true },
            where: {
                productoId: Number(productoId),
                deletedAt: null,
                almacen: {
                    deletedAt: null,
                    activo: true,
                },
            },
        });
        const total = Number(agregado?._sum?.stockActual ?? 0);
        await tx.producto.update({
            where: { id: Number(productoId) },
            data: { stockActual: total },
        });
        return total;
    }

    async ajustarStock({
        almacenId,
        productoId,
        empresaId,
        sucursalId,
        stockActual,
        stockMinimo,
        ubicacionEstante,
    }) {
        const idAlmacen = Number(almacenId);
        const idProducto = Number(productoId);
        const nuevoStock = Number(stockActual);

        if (!Number.isSafeInteger(nuevoStock) || nuevoStock < 0 || nuevoStock > 1000000) {
            throw crearErrorAlmacen('El stockActual debe ser un entero mayor o igual a 0', 400);
        }

        let minimoNormalizado;
        if (stockMinimo !== undefined && stockMinimo !== null && stockMinimo !== '') {
            minimoNormalizado = Number(stockMinimo);
            if (!Number.isSafeInteger(minimoNormalizado) || minimoNormalizado < 0 || minimoNormalizado > 1000000) {
                throw crearErrorAlmacen('El stockMinimo debe ser un entero mayor o igual a 0', 400);
            }
        }

        let estanteNormalizado;
        if (ubicacionEstante !== undefined) {
            if (ubicacionEstante === null || ubicacionEstante === '') {
                estanteNormalizado = null;
            } else if (typeof ubicacionEstante === 'string') {
                estanteNormalizado = ubicacionEstante.trim().slice(0, 100) || null;
            } else {
                throw crearErrorAlmacen('La ubicación en estante no es válida', 400);
            }
        }

        const ctx = this.resolverContextoSucursal(empresaId, sucursalId);

        return this.prisma.$transaction(async (tx) => {
            const almacen = await tx.almacen.findFirst({
                where: {
                    id: idAlmacen,
                    empresaId: ctx.empresaId,
                    ...(ctx.sucursalId !== null ? { sucursalId: ctx.sucursalId } : {}),
                    deletedAt: null,
                },
            });
            if (!almacen) {
                throw crearErrorAlmacen('Almacén no encontrado', 404);
            }
            if (!almacen.activo) {
                throw crearErrorAlmacen('No se puede ajustar inventario en un almacén inactivo', 409);
            }

            const producto = await tx.producto.findFirst({
                where: {
                    id: idProducto,
                    empresaId: almacen.empresaId,
                    sucursalId: almacen.sucursalId,
                    deletedAt: null,
                },
                select: { id: true, nombre: true, stockMinimo: true },
            });
            if (!producto) {
                throw crearErrorAlmacen('Producto no encontrado en la sucursal del almacén', 404);
            }

            const registro = await tx.inventarioAlmacen.upsert({
                where: {
                    almacenId_productoId: {
                        almacenId: almacen.id,
                        productoId: producto.id,
                    },
                },
                update: {
                    empresaId: almacen.empresaId,
                    sucursalId: almacen.sucursalId,
                    stockActual: nuevoStock,
                    ...(minimoNormalizado !== undefined ? { stockMinimo: minimoNormalizado } : {}),
                    ...(estanteNormalizado !== undefined ? { ubicacionEstante: estanteNormalizado } : {}),
                    deletedAt: null,
                },
                create: {
                    empresaId: almacen.empresaId,
                    sucursalId: almacen.sucursalId,
                    almacenId: almacen.id,
                    productoId: producto.id,
                    stockActual: nuevoStock,
                    stockMinimo: minimoNormalizado ?? producto.stockMinimo ?? 1,
                    ubicacionEstante: estanteNormalizado ?? null,
                },
                omit: this.omit,
            });

            const stockGlobal = await this.recalcularStockProductoEnTx(tx, producto.id);

            return {
                ...registro,
                productoNombre: producto.nombre,
                almacenNombre: almacen.nombre,
                stockGlobal,
            };
        });
    }

    async transferirStock({
        origenAlmacenId,
        destinoAlmacenId,
        productoId,
        cantidad,
        empresaId,
        sucursalId,
    }) {
        const idOrigen = Number(origenAlmacenId);
        const idDestino = Number(destinoAlmacenId);
        const idProducto = Number(productoId);
        const cant = Number(cantidad);

        if (!Number.isSafeInteger(idOrigen) || idOrigen < 1
            || !Number.isSafeInteger(idDestino) || idDestino < 1
            || !Number.isSafeInteger(idProducto) || idProducto < 1) {
            throw crearErrorAlmacen('Almacén origen, destino y producto deben ser identificadores válidos', 400);
        }
        if (idOrigen === idDestino) {
            throw crearErrorAlmacen('El almacén de origen y destino deben ser diferentes', 400);
        }
        if (!Number.isSafeInteger(cant) || cant <= 0 || cant > 1000000) {
            throw crearErrorAlmacen('La cantidad a transferir debe ser un entero mayor que 0', 400);
        }

        const ctx = this.resolverContextoSucursal(empresaId, sucursalId);

        return this.prisma.$transaction(async (tx) => {
            const [origen, destino] = await Promise.all([
                tx.almacen.findFirst({
                    where: {
                        id: idOrigen,
                        empresaId: ctx.empresaId,
                        ...(ctx.sucursalId !== null ? { sucursalId: ctx.sucursalId } : {}),
                        deletedAt: null,
                    },
                }),
                tx.almacen.findFirst({
                    where: {
                        id: idDestino,
                        empresaId: ctx.empresaId,
                        ...(ctx.sucursalId !== null ? { sucursalId: ctx.sucursalId } : {}),
                        deletedAt: null,
                    },
                }),
            ]);

            if (!origen) throw crearErrorAlmacen('Almacén de origen no encontrado', 404);
            if (!destino) throw crearErrorAlmacen('Almacén de destino no encontrado', 404);

            if (origen.empresaId !== destino.empresaId || origen.sucursalId !== destino.sucursalId) {
                throw crearErrorAlmacen('La transferencia solo puede hacerse entre almacenes de la misma sucursal', 400);
            }
            if (!origen.activo || !destino.activo) {
                throw crearErrorAlmacen('Ambos almacenes deben estar activos para transferir inventario', 409);
            }

            const producto = await tx.producto.findFirst({
                where: {
                    id: idProducto,
                    empresaId: origen.empresaId,
                    sucursalId: origen.sucursalId,
                    deletedAt: null,
                },
                select: { id: true, nombre: true, stockMinimo: true },
            });
            if (!producto) {
                throw crearErrorAlmacen('El producto no existe en la sucursal de los almacenes', 404);
            }

            const descuentoOrigen = await tx.inventarioAlmacen.updateMany({
                where: {
                    almacenId: origen.id,
                    productoId: producto.id,
                    deletedAt: null,
                    stockActual: { gte: cant },
                },
                data: {
                    stockActual: { decrement: cant },
                },
            });

            if (descuentoOrigen.count === 0) {
                const invOrigen = await tx.inventarioAlmacen.findFirst({
                    where: { almacenId: origen.id, productoId: producto.id, deletedAt: null },
                    select: { stockActual: true },
                });
                const disponible = invOrigen?.stockActual ?? 0;
                throw crearErrorAlmacen(
                    `Stock insuficiente en "${origen.nombre}" para "${producto.nombre}". Disponible: ${disponible}, solicitado: ${cant}.`,
                    409
                );
            }

            const destinoActualizado = await tx.inventarioAlmacen.upsert({
                where: {
                    almacenId_productoId: {
                        almacenId: destino.id,
                        productoId: producto.id,
                    },
                },
                update: {
                    empresaId: destino.empresaId,
                    sucursalId: destino.sucursalId,
                    stockActual: { increment: cant },
                    deletedAt: null,
                },
                create: {
                    empresaId: destino.empresaId,
                    sucursalId: destino.sucursalId,
                    almacenId: destino.id,
                    productoId: producto.id,
                    stockActual: cant,
                    stockMinimo: producto.stockMinimo ?? 1,
                },
                omit: this.omit,
            });

            const origenActualizado = await tx.inventarioAlmacen.findFirst({
                where: { almacenId: origen.id, productoId: producto.id, deletedAt: null },
                omit: this.omit,
            });

            const stockGlobal = await this.recalcularStockProductoEnTx(tx, producto.id);

            return {
                productoId: producto.id,
                productoNombre: producto.nombre,
                cantidad: cant,
                stockGlobal,
                origen: {
                    almacenId: origen.id,
                    nombre: origen.nombre,
                    stockActual: origenActualizado?.stockActual ?? 0,
                },
                destino: {
                    almacenId: destino.id,
                    nombre: destino.nombre,
                    stockActual: destinoActualizado.stockActual,
                },
            };
        });
    }
}

export const almacenDao = new AlmacenDao();
