import { z } from 'zod';
import { ColumnType, ColumnDefinition } from './types';

export class SchemaValidator {
  private static columnValidators: Record<ColumnType, z.ZodTypeAny> = {
    'string': z.string(),
    'text': z.string(),
    'varchar': z.string(),
    'integer': z.number().int(),
    'bigint': z.number().int(),
    'serial': z.number().int(),
    'bigserial': z.number().int(),
    'float': z.number(),
    'double': z.number(),
    'decimal': z.number(),
    'numeric': z.number(),
    'boolean': z.boolean(),
    'date': z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    'timestamp': z.date().or(z.string().datetime()),
    'timestamptz': z.date().or(z.string().datetime()),
    'json': z.any(),
    'jsonb': z.any(),
    'uuid': z.string().uuid(),
    'binary': z.instanceof(Buffer).or(z.string()),
    'bytea': z.instanceof(Buffer).or(z.string())
  };

  static validateColumnDefinition(
    columnName: string,
    definition: ColumnDefinition
  ): string[] {
    const errors: string[] = [];

    // Validate type
    if (!this.columnValidators[definition.type]) {
      errors.push(`Column '${columnName}' has invalid type: ${definition.type}`);
    }

    // Validate length for varchar
    if (definition.type === 'varchar' && definition.length && definition.length <= 0) {
      errors.push(`Column '${columnName}' has invalid length: ${definition.length}`);
    }

    // Validate precision/scale for decimal/numeric
    if ((definition.type === 'decimal' || definition.type === 'numeric') && definition.precision) {
      if (definition.precision <= 0) {
        errors.push(`Column '${columnName}' has invalid precision: ${definition.precision}`);
      }
      if (definition.scale !== undefined && definition.scale > definition.precision) {
        errors.push(`Column '${columnName}' scale cannot be greater than precision`);
      }
    }

    // Validate references
    if (definition.references) {
      if (!definition.references.table || !definition.references.column) {
        errors.push(`Column '${columnName}' has invalid reference`);
      }
    }

    return errors;
  }

  static validateDataAgainstColumn(
    columnName: string,
    columnDef: ColumnDefinition,
    value: any
  ): { valid: boolean; error?: string } {
    try {
      let validator = this.columnValidators[columnDef.type];

      // Apply length constraints
      if (columnDef.type === 'varchar' && columnDef.length) {
        validator = (validator as z.ZodString).max(columnDef.length);
      }

      // Apply nullable
      if (columnDef.nullable) {
        validator = validator.nullable();
      }

      const result = validator.safeParse(value);
      if (!result.success) {
        return {
          valid: false,
          error: `Column '${columnName}': ${result.error.errors[0].message}`
        };
      }

      return { valid: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        valid: false,
        error: `Column '${columnName}': ${msg}`
      };
    }
  }

  static createRowValidator(columns: Record<string, ColumnDefinition>) {
    const shape: Record<string, z.ZodTypeAny> = {};

    for (const [columnName, columnDef] of Object.entries(columns)) {
      let validator = this.columnValidators[columnDef.type];

      if (columnDef.nullable) {
        validator = validator.nullable();
      }

      shape[columnName] = validator;
    }

    return z.object(shape);
  }

  static validateInsertData(
    tableName: string,
    columns: Record<string, ColumnDefinition>,
    data: Record<string, any>
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const validator = this.createRowValidator(columns);

    // Check for missing required columns
    for (const [columnName, columnDef] of Object.entries(columns)) {
      if (!columnDef.nullable && columnDef.default === undefined && !(columnName in data)) {
        errors.push(`Column '${columnName}' is required but missing`);
      }
    }

    // Check for extra columns
    for (const columnName in data) {
      if (!(columnName in columns)) {
        errors.push(`Column '${columnName}' does not exist in table '${tableName}'`);
      }
    }

    // Validate data types
    const result = validator.safeParse(data);
    if (!result.success) {
      errors.push(...result.error.errors.map((err: z.ZodIssue) => 
        `${err.path.join('.')}: ${err.message}`
      ));
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateUpdateData(
    tableName: string,
    columns: Record<string, ColumnDefinition>,
    data: Record<string, any>
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for columns that don't exist
    for (const columnName in data) {
      if (!(columnName in columns)) {
        errors.push(`Column '${columnName}' does not exist in table '${tableName}'`);
        continue;
      }

      // Validate data type
      const columnDef = columns[columnName];
      const validation = this.validateDataAgainstColumn(columnName, columnDef, data[columnName]);
      if (!validation.valid) {
        errors.push(validation.error!);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  static normalizeValue(value: any, columnDef: ColumnDefinition): any {
    if (value === null || value === undefined) {
      return value;
    }

    switch (columnDef.type) {
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
          return value.toLowerCase() === 'true';
        }
        return Boolean(value);
      case 'integer':
      case 'bigint':
      case 'float':
      case 'double':
      case 'decimal':
      case 'numeric':
        if (typeof value === 'string') {
          return Number(value);
        }
        return value;
      default:
        return value;
    }
  }
}