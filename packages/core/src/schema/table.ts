import { z } from 'zod';
import { ColumnType, ColumnDefinition, TableDefinition } from './types';

export class TableSchema {
  private validator: z.ZodSchema<any>;
  private insertValidator: z.ZodSchema<any>;
  private updateValidator: z.ZodSchema<any>;

  constructor(public definition: TableDefinition) {
    this.validator = this.createValidator(false);
    this.insertValidator = this.createInsertValidator();
    this.updateValidator = this.createUpdateValidator();
  }

  // Validation methods
  validate(data: Record<string, any>, context: 'insert' | 'update' = 'insert'): {
    success: boolean;
    errors?: string[];
    normalizedData?: Record<string, any>;
  } {
    const validator = context === 'insert' ? this.insertValidator : this.updateValidator;
    const result = validator.safeParse(data);
    
    if (result.success) {
      const normalized = this.normalizeData(result.data);
      return { success: true, normalizedData: normalized };
    }
    
    const errors = result.error.errors.map(err => 
      `${err.path.join('.')}: ${err.message}`
    );
    
    return { success: false, errors };
  }

  validatePartial(data: Record<string, any>): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    for (const [key, value] of Object.entries(data)) {
      const column = this.definition.columns[key];
      if (!column) {
        errors.push(`Column '${key}' does not exist in table '${this.definition.name}'`);
        continue;
      }
      
      const validation = this.validateColumnValue(key, column, value);
      if (!validation.valid) {
        errors.push(validation.error!);
      } else if (validation.warning) {
        warnings.push(validation.warning);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  // SQL Generation
  toSQL(includeIndexes: boolean = true, includeComments: boolean = true): string {
    const statements: string[] = [];
    
    // CREATE TABLE
    const columns = Object.entries(this.definition.columns)
      .map(([name, col]) => this.generateColumnSQL(name, col, includeComments))
      .join(',\n  ');

    let createTable = `CREATE TABLE IF NOT EXISTS ${this.quoteIdentifier(this.definition.name)} (\n  `;
    createTable += columns;
    
    // Primary key (if composite or not defined in columns)
    const primaryKeys = this.getPrimaryKey();
    if (primaryKeys.length > 1) {
      createTable += `,\n  PRIMARY KEY (${primaryKeys.map(pk => this.quoteIdentifier(pk)).join(', ')})`;
    }
    
    // Foreign keys
    if (this.definition.foreignKeys) {
      for (const fk of this.definition.foreignKeys) {
        const onDelete = fk.onDelete ? ` ON DELETE ${fk.onDelete}` : '';
        const onUpdate = fk.onUpdate ? ` ON UPDATE ${fk.onUpdate}` : '';
        createTable += `,\n  FOREIGN KEY (${fk.columns.map(c => this.quoteIdentifier(c)).join(', ')}) `;
        createTable += `REFERENCES ${this.quoteIdentifier(fk.references.table)}`;
        createTable += `(${fk.references.columns.map(c => this.quoteIdentifier(c)).join(', ')})`;
        createTable += `${onDelete}${onUpdate}`;
      }
    }
    
    // Table constraints
    if (this.definition.checks) {
      for (const check of this.definition.checks) {
        createTable += `,\n  CONSTRAINT ${this.quoteIdentifier(check.name)} CHECK (${check.condition})`;
      }
    }
    
    createTable += '\n)';
    
    // Table comment
    if (includeComments && this.definition.comment) {
      createTable += `;\nCOMMENT ON TABLE ${this.quoteIdentifier(this.definition.name)} IS '${this.escapeComment(this.definition.comment)}'`;
    }
    
    // Column comments
    if (includeComments) {
      for (const [columnName, column] of Object.entries(this.definition.columns)) {
        if (column.comment) {
          createTable += `;\nCOMMENT ON COLUMN ${this.quoteIdentifier(this.definition.name)}.${this.quoteIdentifier(columnName)} IS '${this.escapeComment(column.comment)}'`;
        }
      }
    }
    
    statements.push(createTable);
    
    // Indexes
    if (includeIndexes && this.definition.indexes) {
      for (const index of this.definition.indexes) {
        statements.push(this.generateIndexSQL(index));
      }
    }
    
    return statements.join('\n\n');
  }

  generateCreateTableSQL(): string {
    return this.toSQL(true, false);
  }

  generateDropTableSQL(cascade: boolean = false): string {
    return `DROP TABLE IF EXISTS ${this.quoteIdentifier(this.definition.name)}${cascade ? ' CASCADE' : ''};`;
  }

  generateTruncateTableSQL(restartIdentity: boolean = false, cascade: boolean = false): string {
    let sql = `TRUNCATE TABLE ${this.quoteIdentifier(this.definition.name)}`;
    if (restartIdentity) sql += ' RESTART IDENTITY';
    if (cascade) sql += ' CASCADE';
    return sql + ';';
  }

  // Utility methods
  getColumnNames(): string[] {
    return Object.keys(this.definition.columns);
  }

  getPrimaryKey(): string[] {
    if (this.definition.primaryKey) {
      return this.definition.primaryKey;
    }
    
    return Object.entries(this.definition.columns)
      .filter(([_, col]) => col.primaryKey)
      .map(([name]) => name);
  }

  getForeignKeys(): Array<{
    column: string;
    references: { table: string; column: string };
  }> {
    const fks: Array<{
      column: string;
      references: { table: string; column: string };
    }> = [];
    
    for (const [columnName, column] of Object.entries(this.definition.columns)) {
      if (column.references) {
        fks.push({
          column: columnName,
          references: column.references
        });
      }
    }
    
    return fks;
  }

  getIndexes(): Array<{
    name: string;
    columns: string[];
    unique: boolean;
    where?: string;
  }> {
    return (this.definition.indexes || []).map(index => ({
      name: index.name || `idx_${this.definition.name}_${index.columns.join('_')}`,
      columns: index.columns,
      unique: !!index.unique,
      where: index.where
    }));
  }

  getColumnDefinition(columnName: string): ColumnDefinition | undefined {
    return this.definition.columns[columnName];
  }

  hasColumn(columnName: string): boolean {
    return columnName in this.definition.columns;
  }

  isPrimaryKey(columnName: string): boolean {
    const column = this.definition.columns[columnName];
    if (column?.primaryKey) return true;
    
    const primaryKeys = this.getPrimaryKey();
    return primaryKeys.includes(columnName);
  }

  isNullable(columnName: string): boolean {
    const column = this.definition.columns[columnName];
    return column?.nullable || false;
  }

  isUnique(columnName: string): boolean {
    const column = this.definition.columns[columnName];
    if (column?.unique) return true;
    
    // Check if column is part of a unique index
    return (this.definition.indexes || []).some(index => 
      index.unique && index.columns.includes(columnName)
    );
  }

  // Schema comparison
  diff(other: TableSchema): TableDiff {
    const diffs: TableDiff = {
      addedColumns: [],
      removedColumns: [],
      modifiedColumns: [],
      addedIndexes: [],
      removedIndexes: []
    };
    
    // Compare columns
    const thisColumns = new Set(this.getColumnNames());
    const otherColumns = new Set(other.getColumnNames());
    
    // Added columns
    for (const column of otherColumns) {
      if (!thisColumns.has(column)) {
        diffs.addedColumns.push(column);
      }
    }
    
    // Removed columns
    for (const column of thisColumns) {
      if (!otherColumns.has(column)) {
        diffs.removedColumns.push(column);
      }
    }
    
    // Modified columns
    for (const column of thisColumns) {
      if (otherColumns.has(column)) {
        const thisCol = this.definition.columns[column];
        const otherCol = other.definition.columns[column];
        
        if (this.columnsDiffer(thisCol, otherCol)) {
          diffs.modifiedColumns.push({
            name: column,
            from: thisCol,
            to: otherCol
          });
        }
      }
    }
    
    // Compare indexes
    const thisIndexes = this.getIndexes();
    const otherIndexes = other.getIndexes();
    
    const thisIndexKeys = new Set(thisIndexes.map(idx => idx.name));
    const otherIndexKeys = new Set(otherIndexes.map(idx => idx.name));
    
    // Added indexes
    for (const index of otherIndexes) {
      if (!thisIndexKeys.has(index.name)) {
        diffs.addedIndexes.push(index);
      }
    }
    
    // Removed indexes
    for (const index of thisIndexes) {
      if (!otherIndexKeys.has(index.name)) {
        diffs.removedIndexes.push(index);
      }
    }
    
    return diffs;
  }

  // Private helper methods
  private createValidator(forInsert: boolean): z.ZodSchema<any> {
    const shape: Record<string, z.ZodTypeAny> = {};
    
    for (const [columnName, column] of Object.entries(this.definition.columns)) {
      let validator = this.getZodType(column.type);
      
      // Apply length constraints
      if (column.type === 'varchar' && column.length) {
        validator = (validator as z.ZodString).max(column.length);
      }
      
      // Apply nullable
      if (column.nullable) {
        validator = validator.nullable();
      } else if (forInsert && column.default === undefined && !column.autoIncrement) {
        // For insert, non-nullable columns without defaults are required
        validator = validator;
      }
      
      shape[columnName] = validator;
    }
    
    return z.object(shape);
  }

  private createInsertValidator(): z.ZodSchema<any> {
    const shape: Record<string, z.ZodTypeAny> = {};
    
    for (const [columnName, column] of Object.entries(this.definition.columns)) {
      let validator = this.getZodType(column.type);
      
      // Apply length constraints
      if (column.type === 'varchar' && column.length) {
        validator = (validator as z.ZodString).max(column.length);
      }
      
      // Handle auto-increment columns (optional for insert)
      if (column.autoIncrement) {
        validator = validator.optional();
      } else if (column.nullable) {
        validator = validator.nullable();
      } else if (column.default !== undefined) {
        // Has default, so optional
        validator = validator.optional();
      }
      // else: required (no default, not nullable, not auto-increment)
      
      shape[columnName] = validator;
    }
    
    return z.object(shape);
  }

  private createUpdateValidator(): z.ZodSchema<any> {
    const shape: Record<string, z.ZodTypeAny> = {};
    
    for (const [columnName, column] of Object.entries(this.definition.columns)) {
      let validator = this.getZodType(column.type);
      
      // Apply length constraints
      if (column.type === 'varchar' && column.length) {
        validator = (validator as z.ZodString).max(column.length);
      }
      
      // For update, all columns are optional
      validator = validator.optional();
      
      // But if provided and not nullable, validate
      if (!column.nullable) {
        validator = validator.refine(
          (val: any) => val === undefined || val !== null,
          { message: `Column '${columnName}' cannot be set to null` }
        );
      }
      
      shape[columnName] = validator;
    }
    
    return z.object(shape);
  }

  private getZodType(columnType: ColumnType): z.ZodTypeAny {
    switch (columnType) {
      case 'string':
      case 'text':
      case 'varchar':
        return z.string();
      case 'integer':
      case 'bigint':
      case 'serial':
      case 'bigserial':
        return z.number().int();
      case 'float':
      case 'double':
      case 'decimal':
      case 'numeric':
        return z.number();
      case 'boolean':
        return z.boolean();
      case 'date':
        return z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
      case 'timestamp':
      case 'timestamptz':
        return z.date().or(z.string().datetime());
      case 'json':
      case 'jsonb':
        return z.any();
      case 'uuid':
        return z.string().uuid();
      case 'binary':
      case 'bytea':
        return z.instanceof(Buffer).or(z.string());
      default:
        return z.any();
    }
  }

  private validateColumnValue(columnName: string, column: ColumnDefinition, value: any): {
    valid: boolean;
    error?: string;
    warning?: string;
  } {
    try {
      let validator = this.getZodType(column.type);
      
      if (column.nullable) {
        validator = validator.nullable();
      }
      
      const result = validator.safeParse(value);
      if (!result.success) {
        return {
          valid: false,
          error: `Invalid value for column '${columnName}': ${result.error.errors[0].message}`
        };
      }
      
      // Additional validation
      if (column.type === 'varchar' && column.length && typeof value === 'string') {
        if (value.length > column.length) {
          return {
            valid: false,
            error: `Value for column '${columnName}' exceeds maximum length of ${column.length}`
          };
        }
      }
      
      return { valid: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        valid: false,
        error: `Validation error for column '${columnName}': ${message}`
      };
    }
  }

  private normalizeData(data: Record<string, any>): Record<string, any> {
    const normalized: Record<string, any> = { ...data };
    
    for (const [columnName, column] of Object.entries(this.definition.columns)) {
      if (columnName in normalized) {
        normalized[columnName] = this.normalizeValue(normalized[columnName], column);
      }
    }
    
    return normalized;
  }

  private normalizeValue(value: any, column: ColumnDefinition): any {
    if (value === null || value === undefined) {
      return value;
    }
    
    switch (column.type) {
      case 'date':
        if (value instanceof Date) {
          return value.toISOString().split('T')[0];
        }
        return value;
      case 'timestamp':
      case 'timestamptz':
        if (value instanceof Date) {
          return value.toISOString();
        }
        return value;
      case 'json':
      case 'jsonb':
        if (typeof value === 'string') {
          try {
            return JSON.parse(value);
          } catch {
            return value;
          }
        }
        return value;
      case 'boolean':
        if (typeof value === 'string') {
          const lower = value.toLowerCase();
          if (lower === 'true' || lower === 't' || lower === '1' || lower === 'yes') return true;
          if (lower === 'false' || lower === 'f' || lower === '0' || lower === 'no') return false;
        }
        return Boolean(value);
      case 'integer':
      case 'bigint':
      case 'serial':
      case 'bigserial':
        if (typeof value === 'string') {
          const num = Number(value);
          return Number.isInteger(num) ? num : Math.floor(num);
        }
        return Math.floor(Number(value));
      case 'float':
      case 'double':
      case 'decimal':
      case 'numeric':
        if (typeof value === 'string') {
          return Number(value);
        }
        return Number(value);
      default:
        return value;
    }
  }

  private generateColumnSQL(name: string, column: ColumnDefinition, includeComment: boolean = true): string {
    const parts: string[] = [
      this.quoteIdentifier(name),
      this.getSQLType(column)
    ];
    
    if (column.primaryKey && !column.autoIncrement) {
      parts.push('PRIMARY KEY');
    }
    
    if (column.autoIncrement) {
      parts.push('GENERATED BY DEFAULT AS IDENTITY');
    }
    
    if (!column.nullable) {
      parts.push('NOT NULL');
    }
    
    if (column.unique) {
      parts.push('UNIQUE');
    }
    
    if (column.default !== undefined) {
      parts.push(`DEFAULT ${this.formatDefault(column.default)}`);
    }
    
    if (column.check) {
      parts.push(`CHECK (${column.check})`);
    }
    
    let sql = parts.join(' ');
    
    if (includeComment && column.comment) {
      sql += ` -- ${column.comment}`;
    }
    
    return sql;
  }

  private generateIndexSQL(index: {
    name?: string;
    columns: string[];
    unique?: boolean;
    where?: string;
    using?: string;
  }): string {
    const name = index.name || `idx_${this.definition.name}_${index.columns.join('_')}`;
    const unique = index.unique ? 'UNIQUE ' : '';
    const using = index.using ? ` USING ${index.using}` : '';
    const where = index.where ? ` WHERE ${index.where}` : '';
    
    return `CREATE ${unique}INDEX IF NOT EXISTS ${this.quoteIdentifier(name)} ` +
      `ON ${this.quoteIdentifier(this.definition.name)}${using} ` +
      `(${index.columns.map(c => this.quoteIdentifier(c)).join(', ')})${where};`;
  }

  private getSQLType(col: ColumnDefinition): string {
    switch (col.type) {
      case 'string':
      case 'varchar':
        return col.length ? `VARCHAR(${col.length})` : 'VARCHAR(255)';
      case 'text':
        return 'TEXT';
      case 'integer':
        return 'INTEGER';
      case 'bigint':
        return 'BIGINT';
      case 'serial':
        return 'SERIAL';
      case 'bigserial':
        return 'BIGSERIAL';
      case 'float':
        return 'REAL';
      case 'double':
        return 'DOUBLE PRECISION';
      case 'decimal':
      case 'numeric':
        return col.precision && col.scale 
          ? `NUMERIC(${col.precision}, ${col.scale})`
          : 'NUMERIC';
      case 'boolean':
        return 'BOOLEAN';
      case 'date':
        return 'DATE';
      case 'timestamp':
        return 'TIMESTAMP';
      case 'timestamptz':
        return 'TIMESTAMPTZ';
      case 'json':
        return 'JSON';
      case 'jsonb':
        return 'JSONB';
      case 'uuid':
        return 'UUID';
      case 'binary':
      case 'bytea':
        return 'BYTEA';
      default:
        throw new Error(`Unknown column type: ${col.type}`);
    }
  }

  private formatDefault(value: any): string {
    if (value === null) return 'NULL';
    if (typeof value === 'string') {
      // Check if it's a SQL function
      if (value.match(/^(CURRENT_TIMESTAMP|NOW\(\)|GEN_RANDOM_UUID\(\)|UUID_GENERATE_V4\(\))/i)) {
        return value;
      }
      return `'${value.replace(/'/g, "''")}'`;
    }
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (value instanceof Date) return `'${value.toISOString()}'`;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'object') return `'${JSON.stringify(value)}'`;
    return String(value);
  }

  private columnsDiffer(col1: ColumnDefinition, col2: ColumnDefinition): boolean {
    return col1.type !== col2.type ||
           (col1.length || 0) !== (col2.length || 0) ||
           (col1.precision || 0) !== (col2.precision || 0) ||
           (col1.scale || 0) !== (col2.scale || 0) ||
           col1.nullable !== col2.nullable ||
           col1.unique !== col2.unique ||
           JSON.stringify(col1.default) !== JSON.stringify(col2.default);
  }

  private quoteIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  private escapeComment(comment: string): string {
    return comment.replace(/'/g, "''");
  }
}

// Export the types that were imported
export type { ColumnDefinition, TableDefinition };
export type { ColumnType } from './types';

// Supporting types
export interface ColumnDiff {
  name: string;
  from: ColumnDefinition;
  to: ColumnDefinition;
}

export interface TableDiff {
  addedColumns: string[];
  removedColumns: string[];
  modifiedColumns: ColumnDiff[];
  addedIndexes: Array<{
    name: string;
    columns: string[];
    unique: boolean;
    where?: string;
  }>;
  removedIndexes: Array<{
    name: string;
    columns: string[];
    unique: boolean;
    where?: string;
  }>;
}

// Helper functions for creating table definitions
export function defineTable(definition: TableDefinition): TableSchema {
  return new TableSchema(definition);
}

// Column type helper functions (factory functions)
export function string(length?: number): ColumnDefinition {
  return { type: 'string' as const, length };
}

export function text(): ColumnDefinition {
  return { type: 'text' as const };
}

export function varchar(length: number = 255): ColumnDefinition {
  return { type: 'varchar' as const, length };
}

export function integer(): ColumnDefinition {
  return { type: 'integer' as const };
}

export function bigint(): ColumnDefinition {
  return { type: 'bigint' as const };
}

export function serial(): ColumnDefinition {
  return { type: 'serial' as const, autoIncrement: true };
}

export function bigserial(): ColumnDefinition {
  return { type: 'bigserial' as const, autoIncrement: true };
}

export function float(): ColumnDefinition {
  return { type: 'float' as const };
}

export function double(): ColumnDefinition {
  return { type: 'double' as const };
}

export function decimal(precision?: number, scale?: number): ColumnDefinition {
  return { type: 'decimal' as const, precision, scale };
}

export function numeric(precision?: number, scale?: number): ColumnDefinition {
  return { type: 'numeric' as const, precision, scale };
}

export function boolean(): ColumnDefinition {
  return { type: 'boolean' as const };
}

export function date(): ColumnDefinition {
  return { type: 'date' as const };
}

export function timestamp(): ColumnDefinition {
  return { type: 'timestamp' as const };
}

export function timestamptz(): ColumnDefinition {
  return { type: 'timestamptz' as const };
}

export function json(): ColumnDefinition {
  return { type: 'json' as const };
}

export function jsonb(): ColumnDefinition {
  return { type: 'jsonb' as const };
}

export function uuid(): ColumnDefinition {
  return { type: 'uuid' as const };
}

export function binary(): ColumnDefinition {
  return { type: 'binary' as const };
}

export function bytea(): ColumnDefinition {
  return { type: 'bytea' as const };
}

// Column modifier functions (chainable API)
export function primaryKey(column: ColumnDefinition): ColumnDefinition {
  return { ...column, primaryKey: true };
}

export function nullable(column: ColumnDefinition): ColumnDefinition {
  return { ...column, nullable: true };
}

export function notNull(column: ColumnDefinition): ColumnDefinition {
  return { ...column, nullable: false };
}

export function unique(column: ColumnDefinition): ColumnDefinition {
  return { ...column, unique: true };
}

export function defaultTo(column: ColumnDefinition, value: any): ColumnDefinition {
  return { ...column, default: value };
}

export function references(
  column: ColumnDefinition, 
  table: string, 
  columnName: string,
  options?: { onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT'; onUpdate?: 'CASCADE' | 'SET NULL' | 'RESTRICT' }
): ColumnDefinition {
  return { 
    ...column, 
    references: { 
      table, 
      column: columnName,
      onDelete: options?.onDelete,
      onUpdate: options?.onUpdate
    } 
  };
}

export function check(column: ColumnDefinition, condition: string): ColumnDefinition {
  return { ...column, check: condition };
}

export function comment(column: ColumnDefinition, text: string): ColumnDefinition {
  return { ...column, comment: text };
}

export function autoIncrement(column: ColumnDefinition): ColumnDefinition {
  return { ...column, autoIncrement: true };
}

// Convenience functions for common patterns
export function id(columnType: 'serial' | 'bigserial' | 'uuid' = 'serial'): ColumnDefinition {
  switch (columnType) {
    case 'serial':
      return primaryKey(serial());
    case 'bigserial':
      return primaryKey(bigserial());
    case 'uuid':
      return primaryKey(defaultTo(uuid(), 'gen_random_uuid()'));
    default:
      return primaryKey(serial());
  }
}

export function createdAt(): ColumnDefinition {
  return defaultTo(timestamptz(), 'NOW()');
}

export function updatedAt(): ColumnDefinition {
  return defaultTo(timestamptz(), 'NOW()');
}

export function email(length: number = 255): ColumnDefinition {
  return varchar(length);
}

export function password(): ColumnDefinition {
  return varchar(255);
}

export function name(length: number = 100): ColumnDefinition {
  return varchar(length);
}

// Index helper functions
export function index(columns: string[], options?: {
  name?: string;
  unique?: boolean;
  where?: string;
  using?: 'btree' | 'hash' | 'gist' | 'gin' | 'spgist' | 'brin';
}) {
  return {
    columns,
    name: options?.name,
    unique: options?.unique,
    where: options?.where,
    using: options?.using
  };
}

export function uniqueIndex(columns: string[], options?: {
  name?: string;
  where?: string;
  using?: 'btree' | 'hash' | 'gist' | 'gin' | 'spgist' | 'brin';
}) {
  return index(columns, { ...options, unique: true });
}

// Foreign key helper
export function foreignKey(
  columns: string[],
  references: { table: string; columns: string[] },
  options?: {
    onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
    onUpdate?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
  }
) {
  return {
    columns,
    references,
    onDelete: options?.onDelete,
    onUpdate: options?.onUpdate
  };
}