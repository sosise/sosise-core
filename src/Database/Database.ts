import knex from 'knex';
import DatabaseConfigurationException from '../Exceptions/Database/DatabaseConfigurationException';

export default class Database {

    public static instances: { connectionName: string, instance: Database }[] = [];
    public client: knex;

    /**
     * Constructor
     */
    private constructor(connectionName: string) {
        // TODO
        const databaseConfig = require('../todo');

        // Check if connection configuration exists
        if (databaseConfig.connections[connectionName] === undefined) {
            throw new DatabaseConfigurationException('Database configuration with following name does not exists, please check config/database.ts', connectionName);
        }

        // Create client
        this.client = knex(databaseConfig.connections[connectionName]);
    }

    /**
     * Get connection
     */
    public static getConnection(connectionName: string): Database {
        for (const element of Database.instances) {
            if (element.connectionName === connectionName && element.instance !== null) {
                return element.instance;
            }
        }

        const self = new Database(connectionName);
        Database.instances.push({
            connectionName,
            instance: self
        });
        return self;
    }
}
