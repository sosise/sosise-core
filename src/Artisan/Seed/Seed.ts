import knex from 'knex';
import fs from 'fs';
import Database from '../../Database/Database';
import DefaultConnectionNotSetException from '../../Exceptions/Database/DefaultConnectionNotSetException';

export default class Seed {

    protected dbConnection: knex;
    protected seedsPath = '/build/database/seeds';

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
            return (element.includes('js') && !element.includes('map'));
        });

        // Now iterate through each migration file and try to migrate it
        for (const seedFile of listOfSeedFiles) {
            // Cut the file extension from file name
            const seedName = seedFile.split('.')[0];

            // Log
            console.log(`Start seeding ${seedName}`.yellow);

            // Get seed file path
            const seedFilePath = `${process.cwd()}${this.seedsPath}/${seedName}.js`;

            // Import seed file
            const seedFileClass = await import(seedFilePath);

            // Instantiate seed class
            const instance = new seedFileClass.default();

            // Call run method
            await instance.run();

            // Log
            console.log(`Done seeding ${seedName}`.green);
        }
    }
}
