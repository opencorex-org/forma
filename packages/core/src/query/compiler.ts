export interface CompiledQuery {
  sql: string;
  params: any[];
  metadata: {
    table: string;
    operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'COUNT';
    complexity: 'simple' | 'medium' | 'complex';
  };
}

export class QueryCompiler {
  constructor(private schema: TableSchema) {}

  compileSelect(query: {
    table: string;
    where?: WhereCondition;
    limit?: number;
    offset?: number;
    orderBy?: Record<string, 'asc' | 'desc'>;
    select?: string[];
  }): CompiledQuery {
    const params: any[] = [];
    const parts: string[] = [];
    
    // SELECT clause
    const columns = query.select?.length 
      ? query.select.map(col => this.quoteIdentifier(col)).join(', ')
      : '*';
    parts.push(`SELECT ${columns}`);
    
    // FROM clause
    parts.push(`FROM ${this.quoteIdentifier(query.table)}`);
    
    // WHERE clause
    if (query.where) {
      const whereClause = this.compileWhere(query.where, params);
      if (whereClause) {
        parts.push(`WHERE ${whereClause}`);
      }
    }
    
    // ORDER BY clause
    if (query.orderBy) {
      const orderBy = Object.entries(query.orderBy)
        .map(([col, dir]) => `${this.quoteIdentifier(col)} ${dir.toUpperCase()}`)
        .join(', ');
      parts.push(`ORDER BY ${orderBy}`);
    }
    
    // LIMIT/OFFSET
    if (query.limit !== undefined) {
      parts.push(`LIMIT $${params.length + 1}`);
      params.push(query.limit);
    }
    
    if (query.offset !== undefined) {
      parts.push(`OFFSET $${params.length + 1}`);
      params.push(query.offset);
    }
    
    return {
      sql: parts.join(' '),
      params,
      metadata: {
        table: query.table,
        operation: 'SELECT',
        complexity: this.estimateComplexity(query)
      }
    };
  }

  compileInsert(query: {
    table: string;
    data: Record<string, any>;
    returning?: string[];
  }): CompiledQuery {
    const params: any[] = [];
    const columns: string[] = [];
    const values: string[] = [];
    
    for (const [column, value] of Object.entries(query.data)) {
      columns.push(this.quoteIdentifier(column));
      values.push(`$${params.length + 1}`);
      params.push(value);
    }
    
    const returning = query.returning?.length
      ? ` RETURNING ${query.returning.map(col => this.quoteIdentifier(col)).join(', ')}`
      : '';
    
    return {
      sql: `INSERT INTO ${this.quoteIdentifier(query.table)} (${columns.join(', ')}) VALUES (${values.join(', ')})${returning}`,
      params,
      metadata: {
        table: query.table,
        operation: 'INSERT',
        complexity: 'simple'
      }
    };
  }

  compileBulkInsert(query: {
    table: string;
    data: Record<string, any>[];
  }): CompiledQuery {
    const params: any[] = [];
    const columns = Object.keys(query.data[0]);
    const values: string[] = [];
    
    for (const row of query.data) {
      const rowValues: string[] = [];
      for (const column of columns) {
        rowValues.push(`$${params.length + 1}`);
        params.push(row[column]);
      }
      values.push(`(${rowValues.join(', ')})`);
    }
    
    return {
      sql: `INSERT INTO ${this.quoteIdentifier(query.table)} (${columns.map(c => this.quoteIdentifier(c)).join(', ')}) VALUES ${values.join(', ')}`,
      params,
      metadata: {
        table: query.table,
        operation: 'INSERT',
        complexity: 'medium'
      }
    };
  }

  compileUpdate(query: {
    table: string;
    where: WhereCondition;
    data: Record<string, any>;
  }): CompiledQuery {
    const params: any[] = [];
    const updates: string[] = [];
    
    for (const [column, value] of Object.entries(query.data)) {
      updates.push(`${this.quoteIdentifier(column)} = $${params.length + 1}`);
      params.push(value);
    }
    
    const whereClause = this.compileWhere(query.where, params);
    
    return {
      sql: `UPDATE ${this.quoteIdentifier(query.table)} SET ${updates.join(', ')} WHERE ${whereClause} RETURNING *`,
      params,
      metadata: {
        table: query.table,
        operation: 'UPDATE',
        complexity: 'medium'
      }
    };
  }

  compileDelete(query: {
    table: string;
    where: WhereCondition;
  }): CompiledQuery {
    const params: any[] = [];
    const whereClause = this.compileWhere(query.where, params);
    
    return {
      sql: `DELETE FROM ${this.quoteIdentifier(query.table)} WHERE ${whereClause}`,
      params,
      metadata: {
        table: query.table,
        operation: 'DELETE',
        complexity: 'simple'
      }
    };
  }

  compileCount(query: {
    table: string;
    where?: WhereCondition;
  }): CompiledQuery {
    const params: any[] = [];
    const parts = ['SELECT COUNT(*) as count'];
    parts.push(`FROM ${this.quoteIdentifier(query.table)}`);
    
    if (query.where) {
      const whereClause = this.compileWhere(query.where, params);
      parts.push(`WHERE ${whereClause}`);
    }
    
    return {
      sql: parts.join(' '),
      params,
      metadata: {
        table: query.table,
        operation: 'COUNT',
        complexity: 'simple'
      }
    };
  }

  private compileWhere(where: WhereCondition, params: any[]): string {
    const conditions: string[] = [];
    
    for (const [key, value] of Object.entries(where)) {
      if (key === 'AND' && Array.isArray(value)) {
        const andConditions = value.map(w => this.compileWhere(w, params));
        if (andConditions.length > 0) {
          conditions.push(`(${andConditions.join(' AND ')})`);
        }
      } else if (key === 'OR' && Array.isArray(value)) {
        const orConditions = value.map(w => this.compileWhere(w, params));
        if (orConditions.length > 0) {
          conditions.push(`(${orConditions.join(' OR ')})`);
        }
      } else if (key === 'NOT') {
        const notCondition = this.compileWhere(value, params);
        conditions.push(`NOT (${notCondition})`);
      } else if (typeof value === 'object' && value !== null) {
        // Handle operators: { gt: 10 }, { in: [1, 2, 3] }, { like: '%test%' }
        const operatorConditions = Object.entries(value).map(([op, val]) => {
          switch (op) {
            case 'gt':
              params.push(val);
              return `${this.quoteIdentifier(key)} > $${params.length}`;
            case 'gte':
              params.push(val);
              return `${this.quoteIdentifier(key)} >= $${params.length}`;
            case 'lt':
              params.push(val);
              return `${this.quoteIdentifier(key)} < $${params.length}`;
            case 'lte':
              params.push(val);
              return `${this.quoteIdentifier(key)} <= $${params.length}`;
            case 'in':
              const placeholders = (val as any[]).map(() => {
                params.push(val);
                return `$${params.length}`;
              }).join(', ');
              return `${this.quoteIdentifier(key)} IN (${placeholders})`;
            case 'like':
              params.push(val);
              return `${this.quoteIdentifier(key)} LIKE $${params.length}`;
            case 'not':
              params.push(val);
              return `${this.quoteIdentifier(key)} != $${params.length}`;
            default:
              params.push(val);
              return `${this.quoteIdentifier(key)} = $${params.length}`;
          }
        });
        conditions.push(operatorConditions.join(' AND '));
      } else {
        // Simple equality
        params.push(value);
        conditions.push(`${this.quoteIdentifier(key)} = $${params.length}`);
      }
    }
    
    return conditions.join(' AND ');
  }

  private quoteIdentifier(identifier: string): string {
    return `"${identifier}"`;
  }

  private estimateComplexity(query: any): 'simple' | 'medium' | 'complex' {
    if (!query.where && !query.orderBy && !query.limit) return 'simple';
    if (query.where && typeof query.where === 'object') {
      if (query.where.AND || query.where.OR) return 'complex';
      return 'medium';
    }
    return 'medium';
  }
}