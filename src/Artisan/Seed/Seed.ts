import knex from 'knex';
import fs from 'fs';
import Database from '../../Database/Database';
import DefaultConnectionNotSetException from '../../Exceptions/Database/DefaultConnectionNotSetException';
import commander from 'commander';

export default class Seed {

    protected dbConnection: knex;
    protected seedsPath = '/build/database/seeds';
    protected cli: commander.Command;

    /**
     * Constructor
     */
    constructor(cli: commander.Command) {
        this.cli = cli;
        const databaseConfig = require(process.cwd() + '/build/config/database').default;
        const defaultConnection = databaseConfig.default;
        if (!defaultConnection) {
            throw new DefaultConnectionNotSetException('Default database connection is not set');
        }

        // Connect to database
        this.dbConnection = Database.getConnection(defaultConnection!).client;
    }

    /**
     * Run the database seeds
     */
    public async run(): Promise<void> {
        // Proceed only when seeds path exists
        if (!fs.existsSync(process.cwd() + this.seedsPath)) {
            return;
        }

        // Get list of seed files
        let listOfSeedFiles = fs.readdirSync(process.cwd() + this.seedsPath);

        // Filter out only js files
        listOfSeedFiles = listOfSeedFiles.filter((element) => {
            if (element.match(/js$/) && !element.match(/map$/)) {
                return true;
            }
        });

        // Now iterate through each migration file and try to migrate it
        for (const seedFile of listOfSeedFiles) {
            // Cut the file extension from file name
            const seedName = seedFile.split('.')[0];

            // Get seed file path
            const seedFilePath = `${process.cwd()}${this.seedsPath}/${seedName}.js`;

            // Import seed file
            const seedFileClass = await import(seedFilePath);

            // Instantiate seed class
            const instance = new seedFileClass.default();

            // Do not run seed if environment is not local and seed is restricted to be run only in local environment
            if (process.env.APP_ENV !== 'local' && instance.onlyInLocalEnvironment && !this.cli.force) {
                console.log(`Skipping seed ${seedName}, it is restricted to a local environment only. Please use -f to force`.yellow);
                continue;
            }

            // Log
            console.log(`Start seeding ${seedName}`.yellow);

            // Call run method
            await instance.run();

            // Log
            console.log(`Done seeding ${seedName}`.green);
        }
    }
}
