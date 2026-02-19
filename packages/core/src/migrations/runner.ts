import { Migration } from '../types'; // Importing the Migration type

export class MigrationRunner {
    private migrations: Migration[];

    constructor(migrations: Migration[]) {
        this.migrations = migrations;
    }

    async run(): Promise<void> {
        for (const migration of this.migrations) {
            await this.executeMigration(migration);
        }
    }

    private async executeMigration(migration: Migration): Promise<void> {
        console.log(`Executing migration: ${migration.name}`);
        // Logic to execute the migration
        // This could involve running SQL commands or other operations
    }
}