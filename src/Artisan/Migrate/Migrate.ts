import colors from 'colors';
import fs from 'fs';
import { Knex } from 'knex';
import lodash from 'lodash';
import Database from '../../Database/Database';
import DatabaseMigrationsNotSupported from '../../Exceptions/Database/DatabaseMigrationsNotSupported';
import DefaultConnectionNotSetException from '../../Exceptions/Database/DefaultConnectionNotSetException';
import MigrationDoesNotExistsOnFilesystemException from '../../Exceptions/Database/MigrationDoesNotExistsOnFilesystemException';

export default class Migrate {
    protected dbConnection: Knex;
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
        if (!(await this.dbConnection.schema.hasTable('migrations'))) {
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
                batch,
            });

            // Log
            console.log(colors.green(`Done migrating ${migrationName}`));
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

    /**
     * Show rollback migrations
     */
    public async printRollbackMigrations(): Promise<void> {
        // First of all get all rows from migrations table
        const migrationRows = await this.dbConnection.table('migrations');

        // Get the max batch number, this is the grouping number of migrations we want to rollback
        const lastBatchNumber = lodash.max(lodash.map(migrationRows, 'batch'));

        // Now filter only the migrations we want to rollback according to the batch number
        const migrationNamesToRollback = lodash.map(lodash.filter(migrationRows, { batch: lastBatchNumber }), 'migration').reverse();

        // Log
        console.log(colors.dim(`Following migrations would be rolled back:`));

        // Iterate through all migrations we want to rollback
        for (const migrationName of migrationNamesToRollback) {
            // Log
            console.log(colors.yellow(`${migrationName}`));
        }
    }

    /**
     * Drop all tables and re-run all migrations
     */
    public async fresh(): Promise<void> {
        // Get all tables
        const allTables = await this.getAllTables();

        // Log
        console.log(colors.dim('Drop all tables'));

        // Iterate through all tables and drop them
        for (const tableName of allTables) {
            // Drop table
            await this.dbConnection.schema.dropTableIfExists(tableName);

            // Log
            console.log(colors.green(`Table ${tableName} dropped`));
        }

        // Log
        console.log();
        console.log(colors.dim(`Migrating all migrations`));

        // Create migrations table if needed
        await this.createMigrationsTableIfNeeded();

        // Now run migrate
        await this.run();
    }

    /**
     * Get all tables from database
     */
    private async getAllTables(): Promise<string[]> {
        // Since knex does not has method to get all tables from database, I had to write my own
        // Attention depending on database type, different queries are used
        switch (this.dbConnection.client.constructor.name) {
            case 'Client_MySQL':
            case 'Client_MySQL2': {
                // Prepare query and bindings
                const query = 'SELECT table_name FROM information_schema.tables WHERE table_schema = ?';
                const bindings = [this.dbConnection.client.database()];

                // Send request to database
                const result = await this.dbConnection.raw(query, bindings);

                // Get table names from result
                const tableNames = result[0].map((row: any) => row.TABLE_NAME);

                // Return table names array
                return tableNames;
            }
            case 'Client_SQLite3': {
                // Prepare query and bindings
                const query = "SELECT name AS table_name FROM sqlite_master WHERE type='table'";

                // Send request to database
                const result = await this.dbConnection.raw(query, []);

                // Get table names from result
                const tableNames = result.map((row: any) => row.table_name).filter((tableName: string) => tableName !== 'sqlite_sequence');

                // Return table names array
                return tableNames;
            }
            case 'Client_CockroachDB': {
                // Fetch all table names from the current database
                const rows = await this.dbConnection.select('table_name').from('information_schema.tables').where('table_schema', 'public');

                // Map the result to extract table names
                const tableNames = rows.map((row: any) => row.table_name);

                // Return table names array
                return tableNames;
            }
        }

        throw new DatabaseMigrationsNotSupported('Selected default database is not supported for migrations.');
    }
}
