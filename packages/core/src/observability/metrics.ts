export interface QueryMetric {
    query: string;
    executionTime: number; // in milliseconds
    timestamp: Date;
}

export class MetricsTracker {
    private metrics: QueryMetric[] = [];

    public trackQuery(query: string, executionTime: number): void {
        const metric: QueryMetric = {
            query,
            executionTime,
            timestamp: new Date(),
        };
        this.metrics.push(metric);
    }

    public getMetrics(): QueryMetric[] {
        return this.metrics;
    }

    public clearMetrics(): void {
        this.metrics = [];
    }
}