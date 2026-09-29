import { configuracionSistemaDao } from '../dao/ConfiguracionSistemaDao.js';
import { BaseController } from './BaseController.js';

export class ConfiguracionSistemaController extends BaseController {
    constructor() {
        super(configuracionSistemaDao);
    }

    crear = async (req, res) => {
        try {
            const { clave, valor, tipoDato, descripcion } = req.body;
            this.validar({ clave, valor, tipoDato });
            const registro = await this.dao.create({
                clave: clave.trim(),
                valor: String(valor),
                tipoDato: tipoDato.trim().toLowerCase(),
                descripcion,
            });
            return this.respuestaExito(res, registro, 'Configuración creada correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    actualizar = async (req, res) => {
        try {
            const id = Number(req.params.id);
            const { clave, valor, tipoDato, descripcion } = req.body;
            this.validar({ clave, valor, tipoDato });
            const registro = await this.dao.update(id, {
                clave: clave.trim(),
                valor: String(valor),
                tipoDato: tipoDato.trim().toLowerCase(),
                descripcion,
            });
            return this.respuestaExito(res, registro, 'Configuración actualizada correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    eliminar = async (req, res) => {
        try {
            const registro = await this.dao.delete(Number(req.params.id));
            return this.respuestaExito(res, registro, 'Configuración eliminada correctamente');
        } catch (error) {
            return this.respuestaError(res, error);
        }
    };

    validar({ clave, valor, tipoDato }) {
        if (!clave?.trim()) throw new Error('La clave es requerida');
        if (valor === undefined || valor === null || String(valor).trim() === '') {
            throw new Error('El valor es requerido');
        }
        if (!tipoDato?.trim()) throw new Error('El tipo de dato es requerido');
    }
}

export const configuracionSistemaController = new ConfiguracionSistemaController();
