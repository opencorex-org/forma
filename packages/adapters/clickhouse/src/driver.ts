import { ClickHouse } from 'clickhouse';

export class ClickHouseDriver {
    private client: ClickHouse;

    constructor(config: { host: string; port: number; user: string; password: string; database: string }) {
        this.client = new ClickHouse(config);
    }

    public async query(sql: string, params?: any): Promise<any> {
        return this.client.query(sql, { params }).toPromise();
    }

    public async insert(table: string, data: any[]): Promise<any> {
        return this.client.insert(table, data).toPromise();
    }

    public async close(): Promise<void> {
        // Close the ClickHouse client connection if necessary
    }
}