// This file coordinates cache operations, exporting a class or functions that manage cache state.

class CacheManager {
    private cache: Map<string, any>;

    constructor() {
        this.cache = new Map();
    }

    set(key: string, value: any): void {
        this.cache.set(key, value);
    }

    get(key: string): any | undefined {
        return this.cache.get(key);
    }

    has(key: string): boolean {
        return this.cache.has(key);
    }

    delete(key: string): boolean {
        return this.cache.delete(key);
    }

    clear(): void {
        this.cache.clear();
    }
}

export default CacheManager;