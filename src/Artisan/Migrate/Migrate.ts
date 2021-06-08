import fs from 'fs';
import knex from 'knex';
import lodash from 'lodash';
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
        const databaseConfig = require(process.cwd() + '/build/config/database').default;
        const defaultConnection = databaseConfig.default;
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
     * Run the database migrations
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

        // Filter out only js files
        listOfMigrationFiles = listOfMigrationFiles.filter((element) => {
            if (element.match(/js$/) && !element.match(/map$/)) {
                return true;
            }
        });

        // Now iterate through each migration file and try to migrate it
        for (const migrationFile of listOfMigrationFiles) {
            // Cut the file extension from file name
            const migrationName = migrationFile.split('.')[0];

            // Skip if file was already migrated
            if (lodash.map(migrationRows, 'migration').includes(migrationName)) {
                continue;
            }

            // Log
            console.log(`Start migrating ${migrationName}`.yellow);

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
            console.log(`Done migrating ${migrationName}`.green);
        }
    }

    /**
     * Rollback the last database migration
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
            console.log(`Rolling back migration ${migrationName}`.yellow);

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
            console.log(`Done rolling back migration ${migrationName}`.green);
        }
    }

    /**
     * Drop all tables and re-run all migrations
     */
    public async fresh(): Promise<void> {
        // Get all tables
        const allTables = await this.dbConnection.schema.raw('SHOW TABLES;');

        // Log
        console.log('Drop all tables'.dim);

        // Iterate through all tables and drop them
        for (const tableRow of allTables[0]) {
            // Get table name
            const tableName = tableRow[Object.keys(tableRow)[0]];

            // Drop table
            await this.dbConnection.schema.dropTableIfExists(tableName);

            // Log
            console.log(`Table ${tableName} dropped`.green);
        }

        // Log
        console.log();
        console.log(`Migrating all migrations`.dim);

        // Create migrations table if needed
        await this.createMigrationsTableIfNeeded();

        // Now run migrate
        await this.run();
    }
}
