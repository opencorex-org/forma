import { Pool } from 'pg';

export class TransactionManager {
    private pool: Pool;

    constructor(pool: Pool) {
        this.pool = pool;
    }

    async beginTransaction(): Promise<void> {
        const client = await this.pool.connect();
        await client.query('BEGIN');
        return client;
    }

    async commitTransaction(client: any): Promise<void> {
        await client.query('COMMIT');
        client.release();
    }

    async rollbackTransaction(client: any): Promise<void> {
        await client.query('ROLLBACK');
        client.release();
    }
}