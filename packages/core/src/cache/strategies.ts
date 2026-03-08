// This file defines cache strategies, exporting functions or classes that implement different caching approaches.

export interface CacheStrategy {
    get(key: string): any;
    set(key: string, value: any): void;
    delete(key: string): void;
    clear(): void;
}

export class InMemoryCache implements CacheStrategy {
    private cache: Map<string, any>;

    constructor() {
        this.cache = new Map();
    }

    get(key: string): any {
        return this.cache.get(key);
    }

    set(key: string, value: any): void {
        this.cache.set(key, value);
    }

    delete(key: string): void {
        this.cache.delete(key);
    }

    clear(): void {
        this.cache.clear();
    }
}

export class ExpiringCache implements CacheStrategy {
    private cache: Map<string, { value: any; expiry: number }>;

    constructor(private ttl: number) {
        this.cache = new Map();
    }

    get(key: string): any {
        const entry = this.cache.get(key);
        if (entry && Date.now() < entry.expiry) {
            return entry.value;
        }
        this.cache.delete(key);
        return undefined;
    }

    set(key: string, value: any): void {
        const expiry = Date.now() + this.ttl;
        this.cache.set(key, { value, expiry });
    }

    delete(key: string): void {
        this.cache.delete(key);
    }

    clear(): void {
        this.cache.clear();
    }
}