import 'dotenv/config';
import { cajaDao } from '../dao/CajaDao.js';
import { areaTrabajoDao } from '../dao/AreaTrabajoDao.js';
import { puestoDao } from '../dao/PuestoDao.js';
import { estadoEmpleadoDao } from '../dao/EstadoEmpleadoDao.js';
import { empleadoDao } from '../dao/EmpleadoDao.js';

async function test() {
    console.log("Testing DAOs...");
    console.log("Cajas:", await cajaDao.getAll());
    console.log("AreasTrabajo:", await areaTrabajoDao.getAll());
    console.log("Puestos:", await puestoDao.getAll());
    console.log("EstadosEmpleado:", await estadoEmpleadoDao.getAll());
    console.log("Empleados:", await empleadoDao.getAll());
    console.log("SUCCESS: All 5 DAOs executed queries successfully!");
    process.exit(0);
}

test().catch(err => {
    console.error("Test error:", err);
    process.exit(1);
});
