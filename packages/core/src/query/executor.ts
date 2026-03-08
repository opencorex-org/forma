export interface ExecuteOptions {
  timeout?: number;
  cacheKey?: string;
  cacheTTL?: number;
  readOnly?: boolean;
}

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  command: string;
}

export abstract class DatabaseAdapter {
  abstract executeQuery<T>(
    sql: string,
    params?: any[],
    options?: ExecuteOptions
  ): Promise<QueryResult<T>>;

  abstract beginTransaction(): Promise<Transaction>;
  abstract endTransaction(transaction: Transaction): Promise<void>;
  
  // Connection management
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract isConnected(): boolean;
}

export class Transaction {
  private savepoints: string[] = [];
  
  constructor(
    private adapter: DatabaseAdapter,
    private isolationLevel: 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE' = 'READ COMMITTED'
  ) {}

  async executeQuery<T>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    return this.adapter.executeQuery(sql, params, { readOnly: false });
  }

  async savepoint(name: string): Promise<void> {
    await this.executeQuery(`SAVEPOINT ${name}`);
    this.savepoints.push(name);
  }

  async rollbackToSavepoint(name: string): Promise<void> {
    await this.executeQuery(`ROLLBACK TO SAVEPOINT ${name}`);
  }

  async releaseSavepoint(name: string): Promise<void> {
    await this.executeQuery(`RELEASE SAVEPOINT ${name}`);
    this.savepoints = this.savepoints.filter(sp => sp !== name);
  }
}