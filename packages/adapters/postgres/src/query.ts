// This file compiles PostgreSQL-specific queries, exporting functions or classes for query generation.

export function compileSelectQuery(table: string, columns: string[], conditions?: string): string {
    let query = `SELECT ${columns.join(', ')} FROM ${table}`;
    if (conditions) {
        query += ` WHERE ${conditions}`;
    }
    return query;
}

export function compileInsertQuery(table: string, data: Record<string, any>): string {
    const columns = Object.keys(data).join(', ');
    const values = Object.values(data).map(value => `'${value}'`).join(', ');
    return `INSERT INTO ${table} (${columns}) VALUES (${values})`;
}

export function compileUpdateQuery(table: string, data: Record<string, any>, conditions: string): string {
    const setClause = Object.entries(data)
        .map(([key, value]) => `${key} = '${value}'`)
        .join(', ');
    return `UPDATE ${table} SET ${setClause} WHERE ${conditions}`;
}

export function compileDeleteQuery(table: string, conditions: string): string {
    return `DELETE FROM ${table} WHERE ${conditions}`;
}