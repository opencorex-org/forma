// This file defines PostgreSQL-specific types, exporting interfaces or types used in the adapter.

export interface PostgresConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
}

export interface QueryResult<T> {
    rows: T[];
    rowCount: number;
}

export type QueryParameter = string | number | boolean | null;

export interface QueryOptions {
    timeout?: number;
    fetchSize?: number;
}

export interface Migration {
    version: number;
    description: string;
    up: () => Promise<void>;
    down: () => Promise<void>;
}