export type ColumnType = 
  | 'string' | 'text' | 'varchar'
  | 'integer' | 'bigint' | 'serial' | 'bigserial'
  | 'float' | 'double' | 'decimal' | 'numeric'
  | 'boolean'
  | 'date' | 'timestamp' | 'timestamptz'
  | 'json' | 'jsonb'
  | 'uuid'
  | 'binary' | 'bytea';

export type Operator = 
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'like' | 'ilike' | 'in' | 'nin' | 'between'
  | 'is' | 'isNot' | 'contains' | 'startsWith' | 'endsWith'
  | 'jsonContains' | 'jsonHasKey' | 'jsonPathExists';

export type OrderDirection = 'asc' | 'desc';

export interface ColumnDefinition {
  type: ColumnType;
  nullable?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  default?: any;
  length?: number;
  precision?: number;
  scale?: number;
  autoIncrement?: boolean;
  references?: {
    table: string;
    column: string;
    onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
    onUpdate?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
  };
  check?: string;
  comment?: string;
}

export interface TableDefinition {
  name: string;
  columns: Record<string, ColumnDefinition>;
  indexes?: Array<{
    name?: string;
    columns: string[];
    unique?: boolean;
    where?: string;
    using?: 'btree' | 'hash' | 'gist' | 'gin' | 'spgist' | 'brin';
  }>;
  primaryKey?: string[];
  foreignKeys?: Array<{
    columns: string[];
    references: {
      table: string;
      columns: string[];
    };
    onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
    onUpdate?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
  }>;
  checks?: Array<{
    name: string;
    condition: string;
  }>;
  comment?: string;
  partitionBy?: {
    type: 'range' | 'list' | 'hash';
    column: string;
  };
}

export interface WhereCondition<T = any> {
  AND?: WhereCondition<T>[];
  OR?: WhereCondition<T>[];
  NOT?: WhereCondition<T>;
  [key: string]: any | WhereCondition<T> | {
    [op in Operator]?: any;
  };
}

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  command: string;
  fields?: any[];
  duration?: number;
}

export interface CompiledQuery {
  sql: string;
  params: any[];
  cacheKey?: string;
  cacheTTL?: number;
  metadata: {
    table: string;
    operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'COUNT' | 'AGGREGATE';
    complexity: number;
    estimatedCost: number;
  };
}

export interface DatabaseAdapter {
  executeQuery<T = any>(sql: string, params?: any[], options?: any): Promise<QueryResult<T>>;
  connect?(): Promise<void>;
  disconnect?(): Promise<void>;
  isConnected?(): boolean;
  beginTransaction?(options?: any): Promise<any>;
  endTransaction?(transaction: any): Promise<void>;
}