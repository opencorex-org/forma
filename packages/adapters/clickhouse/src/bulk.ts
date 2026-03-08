// This file handles bulk insert operations for ClickHouse, exporting functions or classes for bulk processing.

export class ClickHouseBulkInserter {
    constructor(private client: any) {}

    async insert(table: string, data: any[]): Promise<void> {
        if (!data.length) {
            throw new Error("No data to insert");
        }

        const query = this.buildInsertQuery(table, data);
        await this.client.query(query);
    }

    private buildInsertQuery(table: string, data: any[]): string {
        const columns = Object.keys(data[0]).join(", ");
        const values = data.map(row => `(${Object.values(row).map(value => this.formatValue(value)).join(", ")})`).join(", ");
        return `INSERT INTO ${table} (${columns}) VALUES ${values}`;
    }

    private formatValue(value: any): string {
        if (typeof value === "string") {
            return `'${value.replace(/'/g, "''")}'`; // Escape single quotes
        }
        if (value === null || value === undefined) {
            return "NULL";
        }
        return value.toString();
    }
}