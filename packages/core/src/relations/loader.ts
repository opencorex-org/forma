import DataLoader from 'dataloader';

class RelationLoader {
    constructor(loadFunction) {
        this.loader = new DataLoader(loadFunction);
    }

    load(key) {
        return this.loader.load(key);
    }

    loadMany(keys) {
        return this.loader.loadMany(keys);
    }

    clear(key) {
        this.loader.clear(key);
    }

    clearAll() {
        this.loader.clearAll();
    }

    prime(key, value) {
        this.loader.prime(key, value);
    }
}

export default RelationLoader;