import { BaseDao, prisma } from './BaseDao.js';

const ZONA_HORARIA_MX = 'America/Mexico_City';
const FORMATO_FECHA_MX = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA_MX,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

function crearErrorReporte(mensaje, status = 400) {
    const error = new Error(mensaje);
    error.status = status;
    return error;
}

function redondearDosDecimales(valor) {
    return Math.round((Number(valor) || 0) * 100) / 100;
}

function formatearFechaMx(fecha = new Date()) {
    return FORMATO_FECHA_MX.format(new Date(fecha));
}

function validarFechaIso(valor, etiqueta) {
    if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor.trim())) {
        throw crearErrorReporte(`La ${etiqueta} debe tener formato YYYY-MM-DD`, 400);
    }
    const texto = valor.trim();
    const [anio, mes, dia] = texto.split('-').map(Number);
    const verificacion = new Date(Date.UTC(anio, mes - 1, dia));
    if (
        verificacion.getUTCFullYear() !== anio
        || verificacion.getUTCMonth() !== mes - 1
        || verificacion.getUTCDate() !== dia
    ) {
        throw crearErrorReporte(`La ${etiqueta} no es una fecha calendario válida`, 400);
    }
    return texto;
}

function restarDiasIso(fechaIso, dias) {
    const [anio, mes, dia] = fechaIso.split('-').map(Number);
    const fecha = new Date(Date.UTC(anio, mes - 1, dia));
    fecha.setUTCDate(fecha.getUTCDate() - dias);
    return fecha.toISOString().slice(0, 10);
}

function sumarDiasIso(fechaIso, dias) {
    return restarDiasIso(fechaIso, -dias);
}

function listarDiasRango(fechaInicio, fechaFin) {
    const [aI, mI, dI] = fechaInicio.split('-').map(Number);
    const [aF, mF, dF] = fechaFin.split('-').map(Number);
    const cursor = new Date(Date.UTC(aI, mI - 1, dI));
    const limite = new Date(Date.UTC(aF, mF - 1, dF));
    const diffDias = Math.round((limite - cursor) / 86_400_000) + 1;
    if (diffDias > 366) {
        return null; // En rangos muy extensos se agregan solo días con actividad
    }
    const dias = [];
    while (cursor <= limite) {
        dias.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dias;
}

function formatearNombreCompleto(entidad, fallback = 'General') {
    if (!entidad) return fallback;
    const partes = [entidad.nombre, entidad.apellidoPaterno, entidad.apellidoMaterno]
        .filter((p) => typeof p === 'string' && p.trim())
        .map((p) => p.trim());
    return partes.join(' ') || fallback;
}

function normalizarEstadoVenta(estado) {
    const limpio = String(estado ?? '').trim().toLowerCase();
    if (['cancelada', 'cancelado'].includes(limpio)) return 'CANCELADA';
    if (['pendiente_pago', 'pendiente'].includes(limpio)) return 'PENDIENTE_PAGO';
    if (['reembolsado', 'reembolsada'].includes(limpio)) return 'REEMBOLSADO';
    return 'COMPLETADA';
}

export class ReporteDao extends BaseDao {
    constructor({ prismaClient = prisma } = {}) {
        super('venta', {
            omit: { updatedAt: true, deletedAt: true },
        });
        this.prisma = prismaClient;
    }

    async resolverFiltros({
        fechaInicio,
        fechaFin,
        almacenId,
        empresaId,
        sucursalId,
    } = {}) {
        const empId = this.resolverEmpresaId(empresaId);
        const sucId = sucursalId === 'todas' || sucursalId === null
            ? null
            : this.resolverSucursalId(sucursalId);

        const hoyMx = formatearFechaMx(new Date());
        const fechaFinStr = fechaFin !== undefined && fechaFin !== null && String(fechaFin).trim() !== ''
            ? validarFechaIso(String(fechaFin), 'fechaFin')
            : hoyMx;
        const fechaInicioStr = fechaInicio !== undefined && fechaInicio !== null && String(fechaInicio).trim() !== ''
            ? validarFechaIso(String(fechaInicio), 'fechaInicio')
            : restarDiasIso(fechaFinStr, 29);

        if (fechaInicioStr > fechaFinStr) {
            throw crearErrorReporte('La fechaInicio no puede ser posterior a la fechaFin', 400);
        }

        let almId = null;
        if (almacenId !== undefined && almacenId !== null && String(almacenId).trim() !== '') {
            const parsed = Number(almacenId);
            if (!Number.isSafeInteger(parsed) || parsed < 1) {
                throw crearErrorReporte('El identificador de almacén no es válido', 400);
            }
            if (typeof this.prisma.almacen?.findFirst === 'function') {
                const almacen = await this.prisma.almacen.findFirst({
                    where: {
                        id: parsed,
                        empresaId: empId,
                        ...(sucId !== null ? { sucursalId: sucId } : {}),
                        deletedAt: null,
                    },
                    select: { id: true },
                });
                if (!almacen) {
                    throw crearErrorReporte('Almacén no encontrado en el contexto actual', 404);
                }
            }
            almId = parsed;
        }

        const inicio = new Date(`${fechaInicioStr}T00:00:00.000-06:00`);
        const fin = new Date(`${fechaFinStr}T23:59:59.999-06:00`);

        return {
            empresaId: empId,
            sucursalId: sucId,
            almacenId: almId,
            fechaInicio: fechaInicioStr,
            fechaFin: fechaFinStr,
            inicio,
            fin,
            filtrosResumen: {
                fechaInicio: fechaInicioStr,
                fechaFin: fechaFinStr,
                almacenId: almId,
                empresaId: empId,
                sucursalId: sucId,
            },
        };
    }

    construirWhereApertura(filtros) {
        return {
            empresaId: filtros.empresaId,
            ...(filtros.sucursalId !== null ? { sucursalId: filtros.sucursalId } : {}),
        };
    }

    async obtenerReporteVentas(params = {}, filtrosResueltos = null) {
        const filtros = filtrosResueltos ?? await this.resolverFiltros(params);
        const aperturaWhere = this.construirWhereApertura(filtros);

        const whereVentas = {
            deletedAt: null,
            createdAt: { gte: filtros.inicio, lte: filtros.fin },
            aperturaCaja: { is: aperturaWhere },
            ...(filtros.almacenId
                ? { detalleVenta: { some: { almacenId: filtros.almacenId } } }
                : {}),
        };

        const [ventas, devoluciones] = await Promise.all([
            this.prisma.venta.findMany({
                where: whereVentas,
                include: {
                    cliente: {
                        select: { id: true, nombre: true, apellidoPaterno: true, apellidoMaterno: true },
                    },
                    empleado: {
                        select: { id: true, nombre: true, apellidoPaterno: true, apellidoMaterno: true },
                    },
                    metodoPago: {
                        select: { id: true, nombre: true, codigo: true },
                    },
                    folioVenta: { select: { id: true } },
                    ...(filtros.almacenId
                        ? {
                            detalleVenta: {
                                where: { almacenId: filtros.almacenId },
                                select: { subtotal: true },
                            },
                        }
                        : {}),
                },
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.devolucion.findMany({
                where: {
                    createdAt: { gte: filtros.inicio, lte: filtros.fin },
                    estadoReembolso: 'COMPLETADA',
                    aperturaCaja: { is: aperturaWhere },
                    ...(filtros.almacenId
                        ? { detalles: { some: { detalleVenta: { is: { almacenId: filtros.almacenId } } } } }
                        : {}),
                },
                select: { id: true, monto: true },
            }),
        ]);

        const diasBase = listarDiasRango(filtros.fechaInicio, filtros.fechaFin);
        const mapaDiario = new Map(
            (diasBase ?? []).map((fecha) => [fecha, { fecha, total: 0, cantidad: 0 }])
        );
        const mapaMetodos = new Map();
        const mapaEstados = new Map();

        let ingresosTotales = 0;
        let cantidadValidas = 0;
        let cancelacionesCantidad = 0;
        let cancelacionesMonto = 0;

        const calcularImporteVenta = (venta) => {
            if (filtros.almacenId && Array.isArray(venta.detalleVenta)) {
                return venta.detalleVenta.reduce((acc, d) => acc + Number(d.subtotal ?? 0), 0);
            }
            return Number(venta.total ?? 0);
        };

        for (const venta of ventas) {
            const estadoNorm = normalizarEstadoVenta(venta.estado);
            const importe = calcularImporteVenta(venta);

            const bucketEstado = mapaEstados.get(estadoNorm) ?? { estado: estadoNorm, cantidad: 0, total: 0 };
            bucketEstado.cantidad += 1;
            bucketEstado.total = redondearDosDecimales(bucketEstado.total + importe);
            mapaEstados.set(estadoNorm, bucketEstado);

            if (estadoNorm === 'CANCELADA') {
                cancelacionesCantidad += 1;
                cancelacionesMonto = redondearDosDecimales(cancelacionesMonto + importe);
                continue;
            }
            if (estadoNorm === 'PENDIENTE_PAGO') {
                continue;
            }

            ingresosTotales = redondearDosDecimales(ingresosTotales + importe);
            cantidadValidas += 1;

            const dia = formatearFechaMx(venta.createdAt);
            const bucketDia = mapaDiario.get(dia) ?? { fecha: dia, total: 0, cantidad: 0 };
            bucketDia.total = redondearDosDecimales(bucketDia.total + importe);
            bucketDia.cantidad += 1;
            mapaDiario.set(dia, bucketDia);

            const claveMetodo = venta.metodoPago?.codigo ?? venta.metodoPago?.nombre ?? 'SIN_METODO';
            const bucketMetodo = mapaMetodos.get(claveMetodo) ?? {
                metodoPagoId: venta.metodoPago?.id ?? null,
                codigo: venta.metodoPago?.codigo ?? claveMetodo,
                nombre: venta.metodoPago?.nombre ?? 'Sin especificar',
                cantidad: 0,
                total: 0,
            };
            bucketMetodo.cantidad += 1;
            bucketMetodo.total = redondearDosDecimales(bucketMetodo.total + importe);
            mapaMetodos.set(claveMetodo, bucketMetodo);
        }

        const devolucionesMonto = redondearDosDecimales(
            devoluciones.reduce((acc, dev) => acc + Number(dev.monto ?? 0), 0)
        );

        const serieDiaria = Array.from(mapaDiario.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));
        const porMetodoPago = Array.from(mapaMetodos.values()).sort((a, b) => b.total - a.total);
        const porEstado = Array.from(mapaEstados.values());
        const ultimasVentas = ventas.slice(0, 15).map((v) => ({
            id: v.id,
            folio: v.folioVenta?.id ? `#${v.folioVenta.id}` : `#${v.id}`,
            folioVentaId: v.folioVenta?.id ?? v.folioVentaId ?? v.id,
            fecha: v.createdAt,
            cliente: formatearNombreCompleto(v.cliente, 'Público general'),
            empleado: formatearNombreCompleto(v.empleado, '—'),
            metodoPago: v.metodoPago?.nombre ?? 'Sin método',
            estado: normalizarEstadoVenta(v.estado),
            total: redondearDosDecimales(calcularImporteVenta(v)),
        }));

        return {
            filtros: filtros.filtrosResumen,
            kpis: {
                ingresosTotales: redondearDosDecimales(ingresosTotales),
                totalVentas: cantidadValidas,
                ticketPromedio: cantidadValidas > 0
                    ? redondearDosDecimales(ingresosTotales / cantidadValidas)
                    : 0,
                cancelaciones: {
                    cantidad: cancelacionesCantidad,
                    monto: redondearDosDecimales(cancelacionesMonto),
                },
                devoluciones: {
                    cantidad: devoluciones.length,
                    monto: devolucionesMonto,
                },
            },
            serieDiaria,
            porMetodoPago,
            porEstado,
            ultimasVentas,
        };
    }

    async obtenerReporteRendimiento(params = {}, filtrosResueltos = null) {
        const filtros = filtrosResueltos ?? await this.resolverFiltros(params);
        const aperturaWhere = this.construirWhereApertura(filtros);
        const contextoSucursal = {
            empresaId: filtros.empresaId,
            ...(filtros.sucursalId !== null ? { sucursalId: filtros.sucursalId } : {}),
            deletedAt: null,
        };

        const hoyMx = formatearFechaMx(new Date());
        const hoyInicio = new Date(`${hoyMx}T00:00:00.000Z`);
        const en7Dias = new Date(`${sumarDiasIso(hoyMx, 7)}T23:59:59.999Z`);

        const [
            ventasValidas,
            asistenciasRows,
            visitasRows,
            membresiasRows,
            clientesActivos,
            aperturasAbiertas,
            cortesRows,
        ] = await Promise.all([
            this.prisma.venta.findMany({
                where: {
                    deletedAt: null,
                    createdAt: { gte: filtros.inicio, lte: filtros.fin },
                    estado: { notIn: ['cancelada', 'cancelado', 'pendiente_pago'] },
                    aperturaCaja: { is: aperturaWhere },
                    ...(filtros.almacenId
                        ? { detalleVenta: { some: { almacenId: filtros.almacenId } } }
                        : {}),
                },
                include: {
                    empleado: {
                        select: {
                            id: true,
                            nombre: true,
                            apellidoPaterno: true,
                            apellidoMaterno: true,
                            puesto: { select: { nombre: true } },
                        },
                    },
                    ...(filtros.almacenId
                        ? {
                            detalleVenta: {
                                where: { almacenId: filtros.almacenId },
                                select: { subtotal: true },
                            },
                        }
                        : {}),
                },
            }),
            this.prisma.asistencia.findMany({
                where: {
                    ...contextoSucursal,
                    fechaHora: { gte: filtros.inicio, lte: filtros.fin },
                },
                select: { id: true, fechaHora: true },
            }),
            this.prisma.visita.findMany({
                where: {
                    ...contextoSucursal,
                    fechaHora: { gte: filtros.inicio, lte: filtros.fin },
                },
                select: { id: true, fechaHora: true, costo: true },
            }),
            this.prisma.clienteMembresia.findMany({
                where: contextoSucursal,
                select: {
                    id: true,
                    fechaFin: true,
                    estadoMembresia: { select: { nombre: true } },
                },
            }),
            this.prisma.cliente.count({
                where: {
                    ...contextoSucursal,
                    estadoCliente: { nombre: 'Activo' },
                },
            }),
            this.prisma.aperturaCaja.count({
                where: {
                    ...contextoSucursal,
                    estado: 'ABIERTA',
                },
            }),
            this.prisma.corteCaja.findMany({
                where: {
                    ...contextoSucursal,
                    fechaCorte: { gte: filtros.inicio, lte: filtros.fin },
                },
                select: { id: true, diferencia: true },
            }),
        ]);

        const mapaEmpleados = new Map();
        for (const venta of ventasValidas) {
            const empId = venta.empleadoId ?? 0;
            const importe = filtros.almacenId && Array.isArray(venta.detalleVenta)
                ? venta.detalleVenta.reduce((acc, d) => acc + Number(d.subtotal ?? 0), 0)
                : Number(venta.total ?? 0);
            const bucket = mapaEmpleados.get(empId) ?? {
                empleadoId: empId,
                nombre: formatearNombreCompleto(venta.empleado, 'Sin asignar'),
                puesto: venta.empleado?.puesto?.nombre ?? '',
                cantidad: 0,
                total: 0,
            };
            bucket.cantidad += 1;
            bucket.total = redondearDosDecimales(bucket.total + importe);
            mapaEmpleados.set(empId, bucket);
        }

        const ventasPorEmpleado = Array.from(mapaEmpleados.values())
            .map((e) => ({
                ...e,
                ticketPromedio: e.cantidad > 0 ? redondearDosDecimales(e.total / e.cantidad) : 0,
            }))
            .sort((a, b) => b.total - a.total);

        const diasBase = listarDiasRango(filtros.fechaInicio, filtros.fechaFin);
        const mapaAsistencias = new Map(
            (diasBase ?? []).map((fecha) => [fecha, { fecha, asistencias: 0, visitas: 0 }])
        );
        for (const a of asistenciasRows) {
            const dia = formatearFechaMx(a.fechaHora);
            const bucket = mapaAsistencias.get(dia) ?? { fecha: dia, asistencias: 0, visitas: 0 };
            bucket.asistencias += 1;
            mapaAsistencias.set(dia, bucket);
        }
        let ingresosVisitas = 0;
        for (const v of visitasRows) {
            const dia = formatearFechaMx(v.fechaHora);
            const bucket = mapaAsistencias.get(dia) ?? { fecha: dia, asistencias: 0, visitas: 0 };
            bucket.visitas += 1;
            mapaAsistencias.set(dia, bucket);
            ingresosVisitas = redondearDosDecimales(ingresosVisitas + Number(v.costo ?? 0));
        }

        let vigentes = 0;
        let vencidas = 0;
        let canceladas = 0;
        let porVencer7Dias = 0;
        for (const m of membresiasRows) {
            const nombreEstado = String(m.estadoMembresia?.nombre ?? '').trim().toLowerCase();
            if (nombreEstado === 'cancelada') {
                canceladas += 1;
            } else if (nombreEstado === 'vencida' || (m.fechaFin && new Date(m.fechaFin) < hoyInicio)) {
                vencidas += 1;
            } else {
                vigentes += 1;
                if (m.fechaFin) {
                    const finMemb = new Date(m.fechaFin);
                    if (finMemb >= hoyInicio && finMemb <= en7Dias) {
                        porVencer7Dias += 1;
                    }
                }
            }
        }

        const diferenciaAcumulada = redondearDosDecimales(
            cortesRows.reduce((acc, c) => acc + Number(c.diferencia ?? 0), 0)
        );
        const cortesCuadrados = cortesRows.filter((c) => Math.abs(Number(c.diferencia ?? 0)) < 0.01).length;

        return {
            filtros: filtros.filtrosResumen,
            ventasPorEmpleado,
            asistencias: {
                totalAsistencias: asistenciasRows.length,
                totalVisitas: visitasRows.length,
                ingresosVisitas,
                serieDiaria: Array.from(mapaAsistencias.values()).sort((a, b) => a.fecha.localeCompare(b.fecha)),
            },
            membresias: {
                vigentes,
                vencidas,
                canceladas,
                porVencer7Dias,
                clientesActivos,
            },
            caja: {
                aperturasAbiertas,
                cortes: cortesRows.length,
                diferenciaAcumulada,
                cortesCuadrados,
            },
        };
    }

    async obtenerTopProductos(params = {}, filtrosResueltos = null) {
        const filtros = filtrosResueltos ?? await this.resolverFiltros(params);
        const aperturaWhere = this.construirWhereApertura(filtros);

        const [detallesVendidos, productosCatalogo] = await Promise.all([
            this.prisma.detalleVenta.findMany({
                where: {
                    tipoItem: 'PRODUCTO',
                    productoId: { not: null },
                    ...(filtros.almacenId ? { almacenId: filtros.almacenId } : {}),
                    venta: {
                        is: {
                            deletedAt: null,
                            createdAt: { gte: filtros.inicio, lte: filtros.fin },
                            estado: { notIn: ['cancelada', 'cancelado', 'pendiente_pago'] },
                            aperturaCaja: { is: aperturaWhere },
                        },
                    },
                },
                select: {
                    productoId: true,
                    cantidad: true,
                    subtotal: true,
                    producto: {
                        select: {
                            id: true,
                            nombre: true,
                            codigoBarras: true,
                            stockActual: true,
                            stockMinimo: true,
                            categoria: { select: { nombre: true } },
                            inventariosAlmacen: {
                                where: {
                                    deletedAt: null,
                                    almacen: { deletedAt: null, activo: true },
                                    ...(filtros.almacenId ? { almacenId: filtros.almacenId } : {}),
                                },
                                include: {
                                    almacen: { select: { id: true, nombre: true, esPrincipal: true } },
                                },
                                orderBy: [{ almacen: { esPrincipal: 'desc' } }, { almacenId: 'asc' }],
                            },
                        },
                    },
                },
            }),
            this.prisma.producto.findMany({
                where: {
                    empresaId: filtros.empresaId,
                    ...(filtros.sucursalId !== null ? { sucursalId: filtros.sucursalId } : {}),
                    deletedAt: null,
                },
                select: {
                    id: true,
                    stockActual: true,
                    stockMinimo: true,
                    precioCompra: true,
                    precioVenta: true,
                    ...(filtros.almacenId
                        ? {
                            inventariosAlmacen: {
                                where: { almacenId: filtros.almacenId, deletedAt: null },
                                take: 1,
                                select: { stockActual: true, stockMinimo: true },
                            },
                        }
                        : {}),
                },
            }),
        ]);

        const mapaProductos = new Map();
        for (const det of detallesVendidos) {
            const prodId = det.productoId;
            if (!prodId || !det.producto) continue;
            const existente = mapaProductos.get(prodId) ?? {
                productoId: prodId,
                nombre: det.producto.nombre,
                codigoBarras: det.producto.codigoBarras ?? null,
                categoria: det.producto.categoria?.nombre ?? 'Sin categoría',
                unidadesVendidas: 0,
                ingresos: 0,
                producto: det.producto,
            };
            existente.unidadesVendidas += Number(det.cantidad ?? 0);
            existente.ingresos = redondearDosDecimales(existente.ingresos + Number(det.subtotal ?? 0));
            mapaProductos.set(prodId, existente);
        }

        const top = Array.from(mapaProductos.values())
            .sort((a, b) => (b.unidadesVendidas - a.unidadesVendidas) || (b.ingresos - a.ingresos))
            .slice(0, 15)
            .map((item, idx) => {
                const inventarios = item.producto.inventariosAlmacen ?? [];
                const invFiltrado = filtros.almacenId ? (inventarios[0] ?? null) : null;
                const stockActual = filtros.almacenId
                    ? (invFiltrado?.stockActual ?? 0)
                    : item.producto.stockActual;
                const stockMinimo = filtros.almacenId
                    ? (invFiltrado?.stockMinimo ?? item.producto.stockMinimo)
                    : item.producto.stockMinimo;

                return {
                    ranking: idx + 1,
                    productoId: item.productoId,
                    nombre: item.nombre,
                    codigoBarras: item.codigoBarras,
                    categoria: item.categoria,
                    unidadesVendidas: item.unidadesVendidas,
                    ingresos: item.ingresos,
                    stockActual,
                    stockGlobal: item.producto.stockActual,
                    stockMinimo,
                    stockPorAlmacen: inventarios.map((inv) => ({
                        almacenId: inv.almacenId,
                        nombre: inv.almacen?.nombre ?? `Almacén #${inv.almacenId}`,
                        esPrincipal: Boolean(inv.almacen?.esPrincipal),
                        stockActual: inv.stockActual,
                        stockMinimo: inv.stockMinimo,
                    })),
                };
            });

        let unidadesTotales = 0;
        let stockBajo = 0;
        let agotados = 0;
        let valorInventario = 0;

        for (const prod of productosCatalogo) {
            const inv = filtros.almacenId ? (prod.inventariosAlmacen?.[0] ?? null) : null;
            const stock = filtros.almacenId ? Number(inv?.stockActual ?? 0) : Number(prod.stockActual ?? 0);
            const minimo = filtros.almacenId
                ? Number(inv?.stockMinimo ?? prod.stockMinimo ?? 1)
                : Number(prod.stockMinimo ?? 1);

            unidadesTotales += stock;
            if (stock <= 0) {
                agotados += 1;
            } else if (stock <= minimo) {
                stockBajo += 1;
            }
            const costoRef = Number(prod.precioCompra ?? prod.precioVenta ?? 0);
            valorInventario = redondearDosDecimales(valorInventario + stock * costoRef);
        }

        return {
            filtros: filtros.filtrosResumen,
            top,
            resumenStock: {
                totalProductos: productosCatalogo.length,
                unidadesTotales,
                stockBajo,
                agotados,
                valorInventario,
            },
        };
    }

    async obtenerResumenCompleto(params = {}) {
        const filtros = await this.resolverFiltros(params);
        const [ventas, rendimiento, topProductos] = await Promise.all([
            this.obtenerReporteVentas(params, filtros),
            this.obtenerReporteRendimiento(params, filtros),
            this.obtenerTopProductos(params, filtros),
        ]);

        return {
            filtros: filtros.filtrosResumen,
            ventas: {
                kpis: ventas.kpis,
                serieDiaria: ventas.serieDiaria,
                porMetodoPago: ventas.porMetodoPago,
                porEstado: ventas.porEstado,
                ultimasVentas: ventas.ultimasVentas,
            },
            rendimiento: {
                ventasPorEmpleado: rendimiento.ventasPorEmpleado,
                asistencias: rendimiento.asistencias,
                membresias: rendimiento.membresias,
                caja: rendimiento.caja,
            },
            topProductos: {
                top: topProductos.top,
                resumenStock: topProductos.resumenStock,
            },
        };
    }
}

export const reporteDao = new ReporteDao();
