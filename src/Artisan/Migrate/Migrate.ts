import fs from 'fs';
import knex from 'knex';
import lodash from 'lodash';
import colors from 'colors';
import DefaultConnectionNotSetException from '../../Exceptions/Database/DefaultConnectionNotSetException';
import Database from '../../Database/Database';
import MigrationDoesNotExistsOnFilesystemException from '../../Exceptions/Database/MigrationDoesNotExistsOnFilesystemException';

export default class Migrate {

    protected dbConnection: knex;
    protected migrationsPath = '/build/database/migrations';

    /**
     * Constructor
     */
    constructor() {
        const defaultConnection = process.env.DEFAULT_DB_CONNECTION;
        if (!defaultConnection) {
            throw new DefaultConnectionNotSetException('Default database connection is not set');
        }

        // Connect to database
        this.dbConnection = Database.getConnection(defaultConnection!).client;
    }

    /**
     * Create migrations table if needed
     */
    public async createMigrationsTableIfNeeded(): Promise<void> {
        // If table does not exists
        if (!await this.dbConnection.schema.hasTable('migrations')) {
            // Create table
            await this.dbConnection.schema.createTable('migrations', (table) => {
                table.increments('id');
                table.string('migration');
                table.integer('batch');
            });
        }
    }

    /**
     * Run all migrations
     */
    public async run(): Promise<void> {
        // Proceed only when migrations path exists
        if (!fs.existsSync(process.cwd() + this.migrationsPath)) {
            return;
        }

        // First of all get all rows from migrations table
        const migrationRows = await this.dbConnection.table('migrations');

        // Initialize batch
        let batch = 1;
        if (migrationRows.length === 0) {
            batch = 1;
        } else {
            batch = lodash.max(lodash.map(migrationRows, 'batch')) + 1;
        }

        // Get list of migration files
        let listOfMigrationFiles = fs.readdirSync(process.cwd() + this.migrationsPath);

        // Filter out only js files with postfix Command
        listOfMigrationFiles = listOfMigrationFiles.filter((element) => {
            return (element.includes('js') && !element.includes('map'));
        });

        // Now iterate through each migration file and try to migrate it
        for (const migrationFile of listOfMigrationFiles) {
            // Cut the file extension from file name
            const migrationName = migrationFile.split('.')[0];

            // Skip if file was already migrated
            if (lodash.map(migrationRows, 'migration').includes(migrationName)) {
                console.log(colors.yellow(`Migration ${migrationName} was already migrated, skipping`));
                continue;
            }

            // Log
            console.log(colors.yellow(`Start migrating ${migrationName}`));

            // Get migration file path
            const migrationFilePath = `${process.cwd()}${this.migrationsPath}/${migrationName}.js`;

            // Import migration file
            const migrationFileClass = await import(migrationFilePath);

            // Instantiate migration class
            const instance = new migrationFileClass.default();

            // Call up method
            await instance.up();

            // Insert to migrations table
            await this.dbConnection.table('migrations').insert({
                migration: migrationName,
                batch
            });

            // Log
            console.log(colors.green(`Done migrating ${migrationName}`));
        }
    }

    /**
     * Rollback previous migrations
     */
    public async rollback(): Promise<void> {
        // First of all get all rows from migrations table
        const migrationRows = await this.dbConnection.table('migrations');

        // Get the max batch number, this is the grouping number of migrations we want to rollback
        const lastBatchNumber = lodash.max(lodash.map(migrationRows, 'batch'));

        // Now filter only the migrations we want to rollback according to the batch number
        const migrationNamesToRollback = lodash.map(lodash.filter(migrationRows, { batch: lastBatchNumber }), 'migration').reverse();

        // Iterate through all migrations we want to rollback
        for (const migrationName of migrationNamesToRollback) {
            // Log
            console.log(colors.yellow(`Rolling back migration ${migrationName}`));

            // Get migration file path
            const migrationFilePath = `${process.cwd()}${this.migrationsPath}/${migrationName}.js`;

            // If migration exists in database but does not exists on filesystem
            if (!fs.existsSync(migrationFilePath)) {
                throw new MigrationDoesNotExistsOnFilesystemException(`Migration ${migrationFilePath} does not exists on filesystem`);
            }

            // Import migration file
            const migrationFileClass = await import(migrationFilePath);

            // Instantiate migration class
            const instance = new migrationFileClass.default();

            // Call down method
            await instance.down();

            // Insert to migrations table
            await this.dbConnection.table('migrations').where('batch', lastBatchNumber).delete();

            // Log
            console.log(colors.green(`Done rolling back migration ${migrationName}`));
        }
    }
}
