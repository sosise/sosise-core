import Database from './Database';
import DefaultConnectionNotSetException from '../Exceptions/Database/DefaultConnectionNotSetException';
import { Knex } from 'knex';

/**
 * Used for migrations
 */
export default abstract class BaseSchema {

    protected dbConnection: Knex;

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
}
