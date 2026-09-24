import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import mariadb from 'mariadb';

const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

const adapter = new PrismaMariaDb(pool);
export const prisma = new PrismaClient({ adapter });

export class BaseDao {
    constructor(modelName, configuracion = {}) {
        this.prisma = prisma;
        this.model = prisma[modelName];
        this.omit = configuracion.omit || {};
    }

    async getAll(additionalWhere = {}) {
        return this.model.findMany({
            where: {
                deletedAt: null,
                ...additionalWhere
            },
            omit: this.omit
        });
    }

    async getById(id) {
        return this.model.findUnique({
            where: {
                id: id,
                deletedAt: null,
            },
            omit: this.omit
        });
    }

    async create(data) {
        return this.model.create({
            data: data,
            omit: this.omit
        });
    }

    async update(id, data) {
        return this.model.update({
            where: {
                id: id,
            },
            data: data,
            omit: this.omit
        });
    }

    async delete(id) {
        return this.model.update({
            where: {
                id: id,
            },
            data: {
                deletedAt: new Date(),
            },
        });
    }
}
