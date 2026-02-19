import { Migration } from './runner';

export class Versioning {
    private versions: string[] = [];

    constructor(initialVersion: string) {
        this.versions.push(initialVersion);
    }

    public addVersion(version: string): void {
        if (!this.versions.includes(version)) {
            this.versions.push(version);
        }
    }

    public getVersions(): string[] {
        return this.versions;
    }

    public isVersionApplied(version: string): boolean {
        return this.versions.includes(version);
    }

    public rollbackToVersion(version: string): void {
        const index = this.versions.indexOf(version);
        if (index !== -1) {
            this.versions = this.versions.slice(0, index + 1);
        }
    }
}