import crypto from 'crypto';
import { asistenciaDao } from '../dao/AsistenciaDao.js';
import { clienteDao } from '../dao/ClienteDao.js';
import { clienteMembresiaDao } from '../dao/ClienteMembresiaDao.js';
import { BaseController } from './BaseController.js';
import { esEscaneoDesdeAndroid, notificarRevisionQr } from '../services/notificacionesQr.js';

const QR_SECRET = process.env.QR_SECRET || process.env.JWT_SECRET || 'apexgym-qr-signing-key-2026';
const QR_TTL_MS = 15 * 60 * 1000;

function generarCodigoQrUnico() {
    return `APX-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
}

function firmarPayloadQr(codigoQr, expiraMs) {
    const base = `APEXGYM|${codigoQr}|${expiraMs}`;
    const firma = crypto.createHmac('sha256', QR_SECRET).update(base).digest('hex').slice(0, 16).toUpperCase();
    return `${base}|${firma}`;
}

function verificarPayloadQr(rawQr) {
    const texto = String(rawQr ?? '').trim();
    if (!texto) throw new Error('Código QR vacío');

    if (texto.startsWith('APEXGYM|')) {
        const partes = texto.split('|');
        if (partes.length !== 4) throw new Error('Formato de código QR no válido');
        const [, codigoQr, expiraStr, firmaRecibida] = partes;
        const expiraMs = Number(expiraStr);
        if (!codigoQr || !Number.isFinite(expiraMs)) {
            throw new Error('Formato de código QR no válido');
        }
        const esperado = firmarPayloadQr(codigoQr, expiraMs).split('|')[3];
        if (firmaRecibida !== esperado) {
            throw new Error('Código QR inválido o alterado');
        }
        if (Date.now() > expiraMs) {
            throw new Error('El código QR expiró. Pide al cliente actualizar su pase QR.');
        }
        return codigoQr;
    }

    if (/^APX-[A-F0-9]{8,32}$/i.test(texto)) {
        return texto.toUpperCase();
    }

    throw new Error('El código escaneado no corresponde a un pase de ApexGym');
}

function calcularDiasRestantesFecha(fechaFin) {
    if (!fechaFin) return 0;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fin = new Date(fechaFin);
    fin.setHours(0, 0, 0, 0);
    const diffTime = fin.getTime() - hoy.getTime();
    return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
}

export class AsistenciaController extends BaseController {
    constructor({
        dao = asistenciaDao,
        clientes = clienteDao,
        membresias = clienteMembresiaDao,
        notificarQr = notificarRevisionQr,
    } = {}) {
        super(dao);
        this.clienteDao = clientes;
        this.clienteMembresiaDao = membresias;
        this.notificarQr = notificarQr;
    }

    _construirRespuestaMiQr = async (usuarioId, regenerar = false) => {
        let cliente = await this.clienteDao.getByUser(usuarioId);
        if (!cliente) {
            throw new Error('No se encontró un perfil de cliente asociado a tu cuenta');
        }

        if (regenerar || !cliente.codigoQr) {
            const nuevoCodigo = generarCodigoQrUnico();
            cliente = await this.clienteDao.actualizarCodigoQr(cliente.id, nuevoCodigo);
        }

        const membresiaActiva = await this.clienteMembresiaDao.getActivaPorCliente(cliente.id);
        let membresia = membresiaActiva;
        let vigente = Boolean(membresiaActiva);
        let mensaje = 'Membresía vigente';

        if (!membresiaActiva) {
            const historial = await this.clienteMembresiaDao.getHistorialPorCliente(cliente.id);
            membresia = Array.isArray(historial) && historial.length > 0 ? historial[0] : null;
            if (membresia?.fechaFin) {
                const f = new Date(membresia.fechaFin);
                const d = String(f.getUTCDate()).padStart(2, '0');
                const m = String(f.getUTCMonth() + 1).padStart(2, '0');
                const y = f.getUTCFullYear();
                mensaje = `Membresía vencida el ${d}/${m}/${y}`;
            } else {
                mensaje = 'Sin membresía activa asignada';
            }
        }

        const expiraMs = Date.now() + QR_TTL_MS;
        const qrPayload = firmarPayloadQr(cliente.codigoQr, expiraMs);

        return {
            codigoQr: cliente.codigoQr,
            qrPayload,
            expiraEn: new Date(expiraMs).toISOString(),
            vigente,
            diasRestantes: vigente ? calcularDiasRestantesFecha(membresia?.fechaFin) : 0,
            mensaje,
            cliente,
            membresia,
        };
    };

    /** GET /api/asistencias/mi-qr */
    obtenerMiQr = async (req, res) => {
        try {
            const usuarioId = req.usuario?.id ?? req.user?.id;
            const data = await this._construirRespuestaMiQr(usuarioId, false);
            return this.respuestaExito(res, data, 'Pase QR obtenido correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    /** POST /api/asistencias/mi-qr/regenerar */
    regenerarMiQr = async (req, res) => {
        try {
            const usuarioId = req.usuario?.id ?? req.user?.id;
            const data = await this._construirRespuestaMiQr(usuarioId, true);
            return this.respuestaExito(res, data, 'Código QR regenerado correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    /** POST /api/asistencias/validar-qr */
    validarQr = async (req, res) => {
        try {
            const { qr } = req.body ?? {};
            const codigoQr = verificarPayloadQr(qr);

            const cliente = await this.clienteDao.getByCodigoQr(codigoQr);
            if (!cliente) {
                return this.respuestaNoEncontrado(res, 'No se encontró ningún cliente asociado a este código QR');
            }

            const scannerUsuarioId = req.usuario?.id ?? req.user?.id ?? null;
            const empresaId = req.usuario?.empresaId ?? req.user?.empresaId ?? cliente.empresaId ?? 1;
            const sucursalId = req.usuario?.sucursalId ?? req.user?.sucursalId ?? cliente.sucursalId ?? null;
            const desdeAndroid = esEscaneoDesdeAndroid(req);

            const membresiaActiva = await this.clienteMembresiaDao.getActivaPorCliente(cliente.id);
            if (!membresiaActiva) {
                const historial = await this.clienteMembresiaDao.getHistorialPorCliente(cliente.id);
                const ultima = Array.isArray(historial) && historial.length > 0 ? historial[0] : null;
                let mensajeDetalle = 'Membresía inexistente o no asignada';
                if (ultima?.fechaFin) {
                    const f = new Date(ultima.fechaFin);
                    const d = String(f.getUTCDate()).padStart(2, '0');
                    const m = String(f.getUTCMonth() + 1).padStart(2, '0');
                    const y = f.getUTCFullYear();
                    mensajeDetalle = `Membresía vencida el ${d}/${m}/${y}`;
                }

                await this.notificarQr({
                    cliente,
                    acceso: false,
                    mensajeDetalle,
                    membresia: ultima,
                    diasRestantes: 0,
                    scannerUsuarioId,
                    empresaId,
                    sucursalId,
                    desdeAndroid,
                });

                return this.respuestaExito(
                    res,
                    {
                        acceso: false,
                        codigo: 'MEMBRESIA_NO_VIGENTE',
                        cliente,
                        membresia: ultima,
                        diasRestantes: 0,
                        fechaExpiracion: ultima?.fechaFin ?? null,
                        mensaje: mensajeDetalle,
                    },
                    `Acceso denegado: ${mensajeDetalle}`
                );
            }

            const diasRestantes = calcularDiasRestantesFecha(membresiaActiva.fechaFin);
            await this.notificarQr({
                cliente,
                acceso: true,
                mensajeDetalle: 'Membresía vigente - Listo para registrar entrada',
                membresia: membresiaActiva,
                diasRestantes,
                scannerUsuarioId,
                empresaId,
                sucursalId,
                desdeAndroid,
            });

            return this.respuestaExito(
                res,
                {
                    acceso: true,
                    codigo: 'ACCESO_AUTORIZADO',
                    cliente,
                    membresia: membresiaActiva,
                    diasRestantes,
                    fechaExpiracion: membresiaActiva.fechaFin,
                    mensaje: 'Membresía vigente - Listo para registrar entrada',
                },
                'Código QR validado correctamente'
            );
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    /**
     * GET /api/asistencias/buscar-cliente?q=termino
     * Busca clientes por nombre para el flujo de recepción.
     */
    buscarCliente = async (req, res) => {
        try {
            const termino = (req.query.q || '').trim();
            if (!termino || termino.length < 2) {
                return this.respuestaExito(res, [], 'Ingresa al menos 2 caracteres para buscar');
            }
            const clientes = await this.clienteDao.buscarPorNombre(termino, {
                sucursalId: req.query.sucursalId ?? null,
            });
            return this.respuestaExito(res, clientes, 'Clientes encontrados');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    /**
     * POST /api/asistencias/validar-y-registrar
     * Valida la membresía del cliente y registra el acceso si está vigente.
     * Body: { clienteId, observaciones? }
     */
    validarYRegistrar = async (req, res) => {
        try {
            const { clienteId, observaciones } = req.body;

            if (!clienteId) {
                throw new Error('El clienteId es requerido');
            }

            // 1. Verificar que el cliente existe con sus datos completos y usuario
            const cliente = await this.clienteDao.getById(Number(clienteId));
            if (!cliente) {
                return this.respuestaNoEncontrado(res, 'Cliente no encontrado');
            }

            // 2. Verificar vigencia de membresía
            // getActivaPorCliente también sincroniza las membresías vencidas en BD
            const membresiaActiva = await this.clienteMembresiaDao.getActivaPorCliente(Number(clienteId));

            if (!membresiaActiva) {
                // Consultar la última membresía para proporcionar detalles exactos
                const historial = await this.clienteMembresiaDao.getHistorialPorCliente(Number(clienteId));
                const ultimaMembresia = (historial && historial.length > 0) ? historial[0] : null;

                let mensajeExplicativo = 'Membresía inexistente o no asignada';
                if (ultimaMembresia && ultimaMembresia.fechaFin) {
                    const fechaFinUTC = new Date(ultimaMembresia.fechaFin);
                    const dia = String(fechaFinUTC.getUTCDate()).padStart(2, '0');
                    const mes = String(fechaFinUTC.getUTCMonth() + 1).padStart(2, '0');
                    const anio = fechaFinUTC.getUTCFullYear();
                    mensajeExplicativo = `Membresía vencida el ${dia}/${mes}/${anio}`;
                }

                const response = {
                    acceso: false,
                    codigo: 'MEMBRESIA_NO_VIGENTE',
                    cliente,
                    membresia: ultimaMembresia,
                    mensaje: mensajeExplicativo
                };

                return res.status(400).json({
                    data: response,
                    statusCode: 400,
                    message: `Acceso denegado: ${mensajeExplicativo}`,
                    responseFlag: 1
                });
            }

            // 3. Registrar la asistencia
            const asistencia = await this.dao.create({
                clienteId: Number(clienteId),
                clienteMembresiaId: membresiaActiva.id,
                observaciones: observaciones ? observaciones.trim() : null,
                fechaHora: new Date()
            });

            // 4. Obtener asistencia completa con relaciones para la respuesta
            const asistenciaCompleta = await this.dao.getById(asistencia.id);

            // Calcular días restantes de vigencia
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);
            const fin = new Date(membresiaActiva.fechaFin);
            fin.setHours(0, 0, 0, 0);
            const diffTime = fin.getTime() - hoy.getTime();
            const diasRestantes = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

            const response = {
                acceso: true,
                codigo: 'ACCESO_AUTORIZADO',
                cliente,
                membresia: membresiaActiva,
                asistencia: asistenciaCompleta,
                diasRestantes,
                fechaExpiracion: membresiaActiva.fechaFin,
                mensaje: 'Acceso autorizado - Membresía Vigente'
            };

            return this.respuestaExito(res, response, 'Acceso autorizado y asistencia registrada');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    /**
     * GET /api/asistencias/cliente/:clienteId
     * Historial de entradas de un cliente con paginación.
     * Query: ?limite=20&pagina=1
     */
    historialPorCliente = async (req, res) => {
        try {
            const clienteId = Number(req.params.clienteId);
            if (isNaN(clienteId)) throw new Error('ID de cliente no válido');

            const limite = Number(req.query.limite) || 20;
            const pagina = Number(req.query.pagina) || 1;

            const resultado = await this.dao.obtenerHistorialPorCliente(clienteId, {
                limite,
                pagina,
                sucursalId: req.query.sucursalId ?? null,
            });
            return this.respuestaExito(res, resultado, 'Historial obtenido exitosamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    /**
     * GET /api/asistencias/hoy
     * Todos los ingresos del día actual y conteo total (aforo).
     * Query opcional: ?fecha=YYYY-MM-DD para consultar otro día
     */
    obtenerHoy = async (req, res) => {
        try {
            const fecha = req.query.fecha || null;
            const asistencias = await this.dao.obtenerAsistenciasDelDia(fecha, {
                sucursalId: req.query.sucursalId ?? null,
            });
            return this.respuestaExito(res, {
                total: asistencias.length,
                asistencias
            }, 'Asistencias del día obtenidas');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    /**
     * DELETE /api/asistencias/:id
     * Eliminación lógica de una asistencia.
     */
    eliminar = async (req, res) => {
        try {
            const registro = await this.dao.delete(Number(req.params.id));
            return this.respuestaExito(res, registro, 'Asistencia eliminada correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };
}

export const asistenciaController = new AsistenciaController();
