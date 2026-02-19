// This file builds analytics queries for ClickHouse, exporting functions or classes for query generation.

export function buildSelectQuery(table: string, columns: string[], conditions?: string): string {
    let query = `SELECT ${columns.join(', ')} FROM ${table}`;
    if (conditions) {
        query += ` WHERE ${conditions}`;
    }
    return query;
}

export function buildInsertQuery(table: string, data: Record<string, any>): string {
    const columns = Object.keys(data).join(', ');
    const values = Object.values(data).map(value => `'${value}'`).join(', ');
    return `INSERT INTO ${table} (${columns}) VALUES (${values})`;
}

export function buildDeleteQuery(table: string, conditions: string): string {
    return `DELETE FROM ${table} WHERE ${conditions}`;
}

export function buildUpdateQuery(table: string, data: Record<string, any>, conditions: string): string {
    const updates = Object.entries(data)
        .map(([key, value]) => `${key} = '${value}'`)
        .join(', ');
    return `UPDATE ${table} SET ${updates} WHERE ${conditions}`;
}