// This file builds aggregation pipelines, exporting functions or classes for aggregation operations.

export function buildAggregationPipeline(pipeline: any[]): any {
    // Implementation for building the aggregation pipeline
    return pipeline;
}

export function addMatchStage(pipeline: any[], matchCriteria: object): void {
    pipeline.push({ $match: matchCriteria });
}

export function addGroupStage(pipeline: any[], groupBy: string, aggregation: object): void {
    pipeline.push({ $group: { _id: `$${groupBy}`, ...aggregation } });
}

export function addSortStage(pipeline: any[], sortCriteria: object): void {
    pipeline.push({ $sort: sortCriteria });
}

// Additional aggregation helper functions can be added here as needed.