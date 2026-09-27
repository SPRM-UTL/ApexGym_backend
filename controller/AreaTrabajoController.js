import { areaTrabajoDao } from '../dao/AreaTrabajoDao.js';
import { BaseController } from './BaseController.js';

export class AreaTrabajoController extends BaseController {
    constructor() {
        super(areaTrabajoDao);
    }
}

export const areaTrabajoController = new AreaTrabajoController();
