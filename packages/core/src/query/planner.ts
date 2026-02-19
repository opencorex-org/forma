import { TableSchema } from '../schema/table';
import { WhereCondition } from './builder';
import { CompiledQuery } from './compiler';

export interface QueryPlan {
  steps: QueryStep[];
  estimatedCost: number;
  estimatedRows: number;
  indexesUsed: string[];
  joinStrategy?: 'nested-loop' | 'hash-join' | 'merge-join';
}

export interface QueryStep {
  type: 'scan' | 'filter' | 'join' | 'sort' | 'limit' | 'aggregate';
  description: string;
  estimatedRows: number;
  cost: number;
}

export class QueryPlanner {
  constructor(private schema: TableSchema) {}

  analyzeSelect(
    table: string,
    where?: WhereCondition,
    options?: {
      orderBy?: Record<string, 'asc' | 'desc'>;
      limit?: number;
      offset?: number;
      groupBy?: string[];
      having?: WhereCondition;
    }
  ): QueryPlan {
    const steps: QueryStep[] = [];
    let estimatedCost = 0;
    let estimatedRows = 1000; // Default table size estimate
    const indexesUsed: string[] = [];

    // Step 1: Table Scan
    const scanStep: QueryStep = {
      type: 'scan',
      description: `Full scan of table ${table}`,
      estimatedRows: 1000,
      cost: 10
    };
    steps.push(scanStep);
    estimatedCost += scanStep.cost;

    // Step 2: Filter (WHERE clause)
    if (where) {
      const filterStep = this.analyzeWhere(where);
      filterStep.estimatedRows = Math.floor(scanStep.estimatedRows * filterStep.estimatedRows / 100);
      steps.push(filterStep);
      estimatedCost += filterStep.cost;
      estimatedRows = filterStep.estimatedRows;

      // Check if indexes can be used
      const index = this.findApplicableIndex(where);
      if (index) {
        indexesUsed.push(index);
        estimatedRows = Math.floor(estimatedRows * 0.1); // Index reduces rows by 90%
        estimatedCost -= 5; // Index reduces cost
      }
    }

    // Step 3: Sort (ORDER BY)
    if (options?.orderBy) {
      const sortStep: QueryStep = {
        type: 'sort',
        description: `Sort by ${Object.keys(options.orderBy).join(', ')}`,
        estimatedRows,
        cost: estimatedRows * 0.1 // Sorting cost is O(n log n), simplified
      };
      steps.push(sortStep);
      estimatedCost += sortStep.cost;
    }

    // Step 4: Group By
    if (options?.groupBy && options.groupBy.length > 0) {
      const groupStep: QueryStep = {
        type: 'aggregate',
        description: `Group by ${options.groupBy.join(', ')}`,
        estimatedRows: Math.floor(estimatedRows / 10), // Grouping reduces rows
        cost: estimatedRows * 0.05
      };
      steps.push(groupStep);
      estimatedCost += groupStep.cost;
      estimatedRows = groupStep.estimatedRows;
    }

    // Step 5: Having
    if (options?.having) {
      const havingStep = this.analyzeWhere(options.having);
      havingStep.estimatedRows = Math.floor(estimatedRows * havingStep.estimatedRows / 100);
      steps.push(havingStep);
      estimatedCost += havingStep.cost;
      estimatedRows = havingStep.estimatedRows;
    }

    // Step 6: Limit
    if (options?.limit) {
      const limitStep: QueryStep = {
        type: 'limit',
        description: `Limit ${options.limit}`,
        estimatedRows: Math.min(estimatedRows, options.limit),
        cost: 1
      };
      steps.push(limitStep);
      estimatedRows = limitStep.estimatedRows;
    }

    // Step 7: Offset
    if (options?.offset) {
      // Offset doesn't affect row count but adds cost
      estimatedCost += 1;
    }

    return {
      steps,
      estimatedCost: Math.round(estimatedCost),
      estimatedRows,
      indexesUsed
    };
  }

  private analyzeWhere(where: WhereCondition): QueryStep {
    const selectivity = this.estimateSelectivity(where);
    
    return {
      type: 'filter',
      description: `Apply WHERE conditions`,
      estimatedRows: selectivity, // percentage
      cost: 5 // Base filter cost
    };
  }

  private estimateSelectivity(where: WhereCondition): number {
    if (!where) return 100;

    let selectivity = 100;
    const conditions = this.flattenConditions(where);

    for (const condition of conditions) {
      const columnSelectivity = this.estimateConditionSelectivity(condition);
      selectivity = Math.min(selectivity, columnSelectivity);
    }

    return selectivity;
  }

  private flattenConditions(where: WhereCondition): Array<{ column: string; operator: string; value: any }> {
    const conditions: Array<{ column: string; operator: string; value: any }> = [];
    
    const traverse = (node: any, path: string[] = []) => {
      if (node.AND) {
        node.AND.forEach((child: any) => traverse(child, path));
      } else if (node.OR) {
        node.OR.forEach((child: any) => traverse(child, path));
      } else if (node.NOT) {
        traverse(node.NOT, path);
      } else {
        for (const [key, value] of Object.entries(node)) {
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            // Operator object
            for (const [op, opValue] of Object.entries(value)) {
              conditions.push({
                column: key,
                operator: op,
                value: opValue
              });
            }
          } else {
            // Simple equality
            conditions.push({
              column: key,
              operator: 'eq',
              value
            });
          }
        }
      }
    };

    traverse(where);
    return conditions;
  }

  private estimateConditionSelectivity(condition: { column: string; operator: string; value: any }): number {
    const column = this.schema.definition.columns[condition.column];
    if (!column) return 10; // Default selectivity

    switch (condition.operator) {
      case 'eq':
        return 5; // Equality returns ~5% of rows
      case 'neq':
        return 95;
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':
        return 33; // Range returns ~33% of rows
      case 'in':
        if (Array.isArray(condition.value)) {
          return Math.min(50, condition.value.length * 5);
        }
        return 10;
      case 'nin':
        return 90;
      case 'like':
        return 25;
      case 'ilike':
        return 30;
      case 'is':
        if (condition.value === null) return 5;
        return 10;
      case 'isNot':
        if (condition.value === null) return 95;
        return 90;
      default:
        return 10;
    }
  }

  private findApplicableIndex(where: WhereCondition): string | null {
    const indexes = this.schema.definition.indexes || [];
    const conditions = this.flattenConditions(where);
    const conditionColumns = new Set(conditions.map(c => c.column));

    for (const index of indexes) {
      // Check if index covers WHERE conditions
      if (index.columns.some(col => conditionColumns.has(col))) {
        return index.name || `idx_${this.schema.definition.name}_${index.columns.join('_')}`;
      }
    }

    return null;
  }

  optimizeQuery(compiledQuery: CompiledQuery): CompiledQuery {
    const plan = this.analyzeSelect(
      compiledQuery.metadata.table,
      undefined, // where would be parsed from SQL
      {
        // Parse options from SQL
      }
    );

    // Add index hints if beneficial
    if (plan.indexesUsed.length > 0 && plan.estimatedCost > 50) {
      const sql = this.addIndexHint(compiledQuery.sql, plan.indexesUsed[0]);
      return {
        ...compiledQuery,
        sql,
        metadata: {
          ...compiledQuery.metadata,
          estimatedCost: plan.estimatedCost
        }
      };
    }

    return compiledQuery;
  }

  private addIndexHint(sql: string, indexName: string): string {
    // Simple index hint addition for PostgreSQL
    const fromIndex = sql.indexOf('FROM');
    if (fromIndex === -1) return sql;

    const tableNameMatch = sql.match(/FROM\s+(\S+)/);
    if (!tableNameMatch) return sql;

    const tableName = tableNameMatch[1];
    return sql.replace(
      `FROM ${tableName}`,
      `FROM ${tableName} /*+ INDEX(${indexName}) */`
    );
  }

  suggestIndexes(): Array<{
    columns: string[];
    reason: string;
    estimatedImprovement: number;
  }> {
    const suggestions = [];
    const columns = Object.keys(this.schema.definition.columns);
    const existingIndexes = this.schema.definition.indexes || [];

    // Check for foreign keys without indexes
    for (const [columnName, column] of Object.entries(this.schema.definition.columns)) {
      if (column.references && !existingIndexes.some(idx => idx.columns.includes(columnName))) {
        suggestions.push({
          columns: [columnName],
          reason: `Foreign key column '${columnName}' is not indexed`,
          estimatedImprovement: 70
        });
      }
    }

    // Check for columns frequently used in WHERE
    const highSelectivityColumns = columns.filter(col => {
      const column = this.schema.definition.columns[col];
      return column.type === 'integer' || column.type === 'uuid' || column.unique;
    });

    for (const column of highSelectivityColumns) {
      if (!existingIndexes.some(idx => idx.columns.includes(column))) {
        suggestions.push({
          columns: [column],
          reason: `High selectivity column '${column}' is not indexed`,
          estimatedImprovement: 60
        });
      }
    }

    return suggestions;
  }
}