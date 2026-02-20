// packages/adapters/postgres/src/driver.ts
import { Pool, PoolClient, QueryResult } from 'pg';
import { DatabaseAdapter, QueryResult as FormaQueryResult, ExecuteOptions } from '@forma/core';

export interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  poolSize?: number;
  ssl?: boolean;
  connectionTimeoutMs?: number;
  idleTimeoutMs?: number;
}

export class PostgresAdapter extends DatabaseAdapter {
  private pool: Pool;
  private connected = false;

  constructor(config: PostgresConfig) {
    super();
    
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: config.poolSize || 20,
      idleTimeoutMillis: config.idleTimeoutMs || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMs || 5000,
      ssl: config.ssl ? { rejectUnauthorized: false } : false
    });

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.pool.on('error', (err) => {
      console.error('Unexpected PostgreSQL pool error:', err);
      this.connected = false;
    });

    this.pool.on('connect', () => {
      this.connected = true;
    });
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    
    try {
      await this.pool.connect();
      this.connected = true;
    } catch (error) {
      this.connected = false;
      throw new Error(`Failed to connect to PostgreSQL: ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    await this.pool.end();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async executeQuery<T>(
    sql: string,
    params: any[] = [],
    options: ExecuteOptions = {}
  ): Promise<FormaQueryResult<T>> {
    const startTime = Date.now();
    let client: PoolClient | null = null;

    try {
      client = await this.pool.connect();
      
      // Set timeout if specified
      if (options.timeout) {
        await client.query(`SET statement_timeout = ${options.timeout}`);
      }

      // Set transaction mode
      if (options.readOnly) {
        await client.query('SET TRANSACTION READ ONLY');
      }

      const result = await client.query<{ [key: string]: any }>(sql, params);
      
      // Convert to our format
      return {
        rows: result.rows as T[],
        rowCount: result.rowCount || 0,
        command: result.command
      };
    } catch (error) {
      console.error('PostgreSQL query error:', {
        sql,
        params,
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      if (client) {
        client.release();
      }
      
      // Record metrics
      const duration = Date.now() - startTime;
      this.recordMetrics(sql, duration, options);
    }
  }

  async beginTransaction(): Promise<Transaction> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      return new Transaction(this, client);
    } catch (error) {
      client.release();
      throw error;
    }
  }

  async endTransaction(transaction: Transaction): Promise<void> {
    const client = (transaction as any).client as PoolClient;
    
    try {
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async bulkInsert<T>(
    table: string,
    records: T[],
    options: {
      batchSize?: number;
      conflict?: 'ignore' | 'update';
      conflictTarget?: string[];
    } = {}
  ): Promise<void> {
    if (records.length === 0) return;
    
    const batchSize = options.batchSize || 1000;
    const columns = Object.keys(records[0] as any);
    
    // Use COPY for large datasets (most efficient)
    if (records.length > 10000) {
      await this.copyInsert(table, columns, records);
      return;
    }
    
    // Use batched INSERT for smaller datasets
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const sql = this.buildBulkInsertSQL(table, columns, batch, options);
      await this.executeQuery(sql);
    }
  }

  private async copyInsert<T>(
    table: string,
    columns: string[],
    records: T[]
  ): Promise<void> {
    const { Client } = require('pg');
    const client = new Client({
      host: this.pool.options.host,
      port: this.pool.options.port,
      database: this.pool.options.database,
      user: this.pool.options.user,
      password: this.pool.options.password
    });

    await client.connect();
    
    try {
      const stream = client.query(
        `COPY ${this.quoteIdentifier(table)} (${columns.map(c => this.quoteIdentifier(c)).join(', ')}) FROM STDIN WITH (FORMAT CSV)`
      );
      
      const csv = records.map(record => {
        return columns.map(col => {
          const value = (record as any)[col];
          if (value === null || value === undefined) return '';
          if (typeof value === 'string') return `"${value.replace(/"/g, '""')}"`;
          return String(value);
        }).join(',');
      }).join('\n');
      
      stream.write(csv);
      stream.end();
      await new Promise((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
      });
    } finally {
      await client.end();
    }
  }

  private buildBulkInsertSQL<T>(
    table: string,
    columns: string[],
    records: T[],
    options: {
      conflict?: 'ignore' | 'update';
      conflictTarget?: string[];
    }
  ): string {
    const values: string[] = [];
    const params: any[] = [];
    
    for (const record of records) {
      const rowValues: string[] = [];
      for (const column of columns) {
        params.push((record as any)[column]);
        rowValues.push(`$${params.length}`);
      }
      values.push(`(${rowValues.join(', ')})`);
    }
    
    let sql = `INSERT INTO ${this.quoteIdentifier(table)} (${columns.map(c => this.quoteIdentifier(c)).join(', ')}) VALUES ${values.join(', ')}`;
    
    if (options.conflict === 'ignore' && options.conflictTarget) {
      sql += ` ON CONFLICT (${options.conflictTarget.map(c => this.quoteIdentifier(c)).join(', ')}) DO NOTHING`;
    } else if (options.conflict === 'update' && options.conflictTarget) {
      const updates = columns
        .filter(col => !options.conflictTarget!.includes(col))
        .map(col => `${this.quoteIdentifier(col)} = EXCLUDED.${this.quoteIdentifier(col)}`);
      
      sql += ` ON CONFLICT (${options.conflictTarget.map(c => this.quoteIdentifier(c)).join(', ')}) DO UPDATE SET ${updates.join(', ')}`;
    }
    
    return sql;
  }

  private quoteIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  private recordMetrics(sql: string, duration: number, options: ExecuteOptions): void {
    // Emit metrics for observability
    process.emit('forma:query', {
      type: 'postgres',
      sql: sql.substring(0, 500), // Truncate for safety
      duration,
      cached: !!options.cacheKey,
      timestamp: new Date().toISOString()
    });
  }
}

class Transaction {
  constructor(
    private adapter: PostgresAdapter,
    public readonly client: PoolClient
  ) {}

  async executeQuery<T>(sql: string, params: any[] = []): Promise<FormaQueryResult<T>> {
    const result = await this.client.query(sql, params);
    return {
      rows: result.rows as T[],
      rowCount: result.rowCount || 0,
      command: result.command
    };
  }
}