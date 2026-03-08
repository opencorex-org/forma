import { Migration } from 'some-migration-library'; // Replace with actual migration library

export class PostgresMigrations {
    private migrations: Migration[];

    constructor() {
        this.migrations = [];
    }

    public addMigration(migration: Migration) {
        this.migrations.push(migration);
    }

    public async runMigrations() {
        for (const migration of this.migrations) {
            await migration.up();
        }
    }

    public async rollbackMigrations() {
        for (const migration of this.migrations.reverse()) {
            await migration.down();
        }
    }
}