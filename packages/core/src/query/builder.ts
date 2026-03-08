import { TableSchema } from '../schema/table';
import { QueryCompiler } from './compiler';

export type Operator = 
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'like' | 'ilike' | 'in' | 'nin' | 'between'
  | 'is' | 'isNot' | 'contains' | 'startsWith' | 'endsWith';

export interface WhereCondition<T = any> {
  AND?: WhereCondition<T>[];
  OR?: WhereCondition<T>[];
  NOT?: WhereCondition<T>;
  [key: string]: any | WhereCondition<T> | {
    [op in Operator]?: any;
  };
}

export interface SelectOptions<T = any> {
  where?: WhereCondition<T>;
  limit?: number;
  offset?: number;
  orderBy?: Record<string, 'asc' | 'desc'> | Array<Record<string, 'asc' | 'desc'>>;
  include?: Record<string, boolean | SelectOptions>;
  select?: (keyof T)[];
  distinct?: boolean | string[];
  groupBy?: string[];
  having?: WhereCondition;
  forUpdate?: boolean;
  skip?: number;
  take?: number;
}

export interface InsertOptions {
  returning?: string[] | boolean;
  onConflict?: {
    target: string[];
    action: 'ignore' | 'update';
    update?: string[];
  };
}

export interface UpdateOptions {
  returning?: string[] | boolean;
  whereCurrentOf?: string;
}

export interface DeleteOptions {
  returning?: string[] | boolean;
  cascade?: boolean;
}

export class QueryBuilder<T = any> {
  private compiler: QueryCompiler;
  private tableName: string;
  private schema: TableSchema;
  private adapter: any;
  private cache?: any;

  constructor(config: {
    tableName: string;
    schema: TableSchema;
    adapter: any;
    cache?: any;
  }) {
    this.tableName = config.tableName;
    this.schema = config.schema;
    this.adapter = config.adapter;
    this.cache = config.cache;
    this.compiler = new QueryCompiler(this.schema);
  }

  // CRUD Operations
  async findMany(options: SelectOptions<T> = {}): Promise<T[]> {
    const query = this.compiler.compileSelect({
      table: this.tableName,
      ...options
    });
    
    // Check cache first
    if (this.cache) {
      const cached = await this.cache.get(query.cacheKey);
      if (cached) return cached;
    }
    
    const result = await this.adapter.executeQuery<T>(query.sql, query.params);
    
    // Cache result
    if (this.cache && query.cacheKey) {
      await this.cache.set(query.cacheKey, result.rows, query.cacheTTL);
    }
    
    return result.rows;
  }

  async findFirst(options: SelectOptions<T> = {}): Promise<T | null> {
    const rows = await this.findMany({ ...options, limit: 1 });
    return rows[0] || null;
  }

  async findUnique(where: WhereCondition<T>): Promise<T | null> {
    return this.findFirst({ where });
  }

  async findById(id: any): Promise<T | null> {
    const pk = this.schema.getPrimaryKey();
    if (pk.length !== 1) {
      throw new Error('findById requires exactly one primary key column');
    }
    
    return this.findFirst({
      where: { [pk[0]]: id } as any
    });
  }

  async count(where?: WhereCondition<T>): Promise<number> {
    const query = this.compiler.compileCount({
      table: this.tableName,
      where
    });
    
    const result = await this.adapter.executeQuery<{ count: string }>(query.sql, query.params);
    return parseInt(result.rows[0]?.count || '0', 10);
  }

  async exists(where: WhereCondition<T>): Promise<boolean> {
    const count = await this.count(where);
    return count > 0;
  }

  async create(data: Partial<T>, options: InsertOptions = {}): Promise<T> {
    const query = this.compiler.compileInsert({
      table: this.tableName,
      data,
      ...options
    });
    
    const result = await this.adapter.executeQuery<T>(query.sql, query.params);
    
    // Invalidate cache
    if (this.cache) {
      await this.cache.invalidate(this.tableName);
    }
    
    return result.rows[0];
  }

  async createMany(data: Partial<T>[], options: InsertOptions = {}): Promise<T[]> {
    if (data.length === 0) return [];
    
    const query = this.compiler.compileBulkInsert({
      table: this.tableName,
      data,
      ...options
    });
    
    const result = await this.adapter.executeQuery<T>(query.sql, query.params);
    
    // Invalidate cache
    if (this.cache) {
      await this.cache.invalidate(this.tableName);
    }
    
    return result.rows;
  }

  async update(where: WhereCondition<T>, data: Partial<T>, options: UpdateOptions = {}): Promise<T[]> {
    const query = this.compiler.compileUpdate({
      table: this.tableName,
      where,
      data,
      ...options
    });
    
    const result = await this.adapter.executeQuery<T>(query.sql, query.params);
    
    // Invalidate cache
    if (this.cache) {
      await this.cache.invalidate(this.tableName);
    }
    
    return result.rows;
  }

  async updateById(id: any, data: Partial<T>, options: UpdateOptions = {}): Promise<T | null> {
    const pk = this.schema.getPrimaryKey();
    if (pk.length !== 1) {
      throw new Error('updateById requires exactly one primary key column');
    }
    
    const rows = await this.update({ [pk[0]]: id } as any, data, options);
    return rows[0] || null;
  }

  async delete(where: WhereCondition<T>, options: DeleteOptions = {}): Promise<T[]> {
    const query = this.compiler.compileDelete({
      table: this.tableName,
      where,
      ...options
    });
    
    const result = await this.adapter.executeQuery<T>(query.sql, query.params);
    
    // Invalidate cache
    if (this.cache) {
      await this.cache.invalidate(this.tableName);
    }
    
    return result.rows;
  }

  async deleteById(id: any, options: DeleteOptions = {}): Promise<T | null> {
    const pk = this.schema.getPrimaryKey();
    if (pk.length !== 1) {
      throw new Error('deleteById requires exactly one primary key column');
    }
    
    const rows = await this.delete({ [pk[0]]: id } as any, options);
    return rows[0] || null;
  }

  async upsert(data: Partial<T>, options: {
    conflictTarget: string[];
    update?: string[];
  }): Promise<T> {
    const query = this.compiler.compileUpsert({
      table: this.tableName,
      data,
      ...options
    });
    
    const result = await this.adapter.executeQuery<T>(query.sql, query.params);
    
    // Invalidate cache
    if (this.cache) {
      await this.cache.invalidate(this.tableName);
    }
    
    return result.rows[0];
  }

  // Aggregations
  async sum(column: string, where?: WhereCondition<T>): Promise<number> {
    const query = this.compiler.compileAggregate({
      table: this.tableName,
      function: 'SUM',
      column,
      where
    });
    
    const result = await this.adapter.executeQuery<{ sum: string }>(query.sql, query.params);
    return parseFloat(result.rows[0]?.sum || '0');
  }

  async avg(column: string, where?: WhereCondition<T>): Promise<number> {
    const query = this.compiler.compileAggregate({
      table: this.tableName,
      function: 'AVG',
      column,
      where
    });
    
    const result = await this.adapter.executeQuery<{ avg: string }>(query.sql, query.params);
    return parseFloat(result.rows[0]?.avg || '0');
  }

  async min(column: string, where?: WhereCondition<T>): Promise<any> {
    const query = this.compiler.compileAggregate({
      table: this.tableName,
      function: 'MIN',
      column,
      where
    });
    
    const result = await this.adapter.executeQuery<{ min: any }>(query.sql, query.params);
    return result.rows[0]?.min;
  }

  async max(column: string, where?: WhereCondition<T>): Promise<any> {
    const query = this.compiler.compileAggregate({
      table: this.tableName,
      function: 'MAX',
      column,
      where
    });
    
    const result = await this.adapter.executeQuery<{ max: any }>(query.sql, query.params);
    return result.rows[0]?.max;
  }

  // Pagination
  async paginate(options: SelectOptions<T> & {
    page: number;
    perPage: number;
  }): Promise<{
    data: T[];
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  }> {
    const { page = 1, perPage = 20, ...selectOptions } = options;
    const offset = (page - 1) * perPage;
    
    const [data, total] = await Promise.all([
      this.findMany({
        ...selectOptions,
        skip: offset,
        take: perPage
      }),
      this.count(selectOptions.where)
    ]);
    
    const totalPages = Math.ceil(total / perPage);
    
    return {
      data,
      total,
      page,
      perPage,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    };
  }

  // Raw query
  async raw<U = any>(sql: string, params: any[] = []): Promise<U[]> {
    const result = await this.adapter.executeQuery<U>(sql, params);
    return result.rows;
  }

  // Transaction support
  withTransaction(adapter: any): QueryBuilder<T> {
    return new QueryBuilder({
      tableName: this.tableName,
      schema: this.schema,
      adapter,
      cache: this.cache
    });
  }

  // Batch operations for high throughput
  async batchInsert(
    data: Partial<T>[],
    options: {
      batchSize?: number;
      concurrency?: number;
      onProgress?: (processed: number, total: number) => void;
    } = {}
  ): Promise<void>