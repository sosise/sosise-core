import { knex, Knex } from 'knex';
import DatabaseConfigurationException from '../Exceptions/Database/DatabaseConfigurationException';

export default class Database {
    public static instances: { connectionName: string; instance: Database }[] = [];
    public client: Knex;

    /**
     * Constructor
     */
    private constructor(connectionName: string) {
        // Get database config
        const databaseConfig = require(process.cwd() + '/build/config/database').default;

        // Check if connection configuration exists
        if (databaseConfig.connections[connectionName] === undefined) {
            throw new DatabaseConfigurationException(
                'Database configuration with following name does not exists, please check config/database.ts',
                connectionName,
            );
        }

        // Create client
        this.client = knex(databaseConfig.connections[connectionName]);
    }

    /**
     * Get connection
     */
    public static getConnection(connectionName: string): Database {
        // Iterate through singleton instances and try to find already instantiated one
        // If found return it
        for (const element of Database.instances) {
            if (element.connectionName === connectionName && element.instance) {
                return element.instance;
            }
        }

        // Ups singleton does not exists, instantiate object
        const self = new Database(connectionName);

        // Remember in static property
        Database.instances.push({
            connectionName,
            instance: self,
        });

        // Return
        return self;
    }
}
