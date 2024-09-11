import colors from "colors";
import figlet from "figlet";
import { createClient } from "redis";
import Database from "../Database/Database";

export default class ServerInformation {
    /**
     * Prints server information
     */
    public async printServerInformation(): Promise<void> {

        // ****************************************************
        // ****************************************************
        // **************** APPLICATION NAME ******************
        // ****************************************************
        // ****************************************************

        // Figlet
        console.log(
            figlet.textSync(
                `${process.env.APP_NAME} is starting...`,
                {
                    font: 'Small',
                    horizontalLayout: 'default',
                    verticalLayout: 'default',
                    width: 80,
                    whitespaceBreak: true,
                }
            )
        );
        console.log();

        // ****************************************************
        // ****************************************************
        // ******************* DATABASE ***********************
        // ****************************************************
        // ****************************************************

        // Output database information
        const databaseConfig = require(process.cwd() + '/build/config/database').default;
        console.log(colors.underline.bold.bgGreen('Database information'));
        for (const [connectionName, connectionConfig] of Object.entries(databaseConfig.connections) as any) {

            console.log(colors.white(`  Client\t\t\t\t\t`) + colors.gray(`${connectionConfig.client}`));
            console.log(colors.white(`  Name\t\t\t\t\t\t`) + colors.gray(`${connectionName}`));

            switch (connectionConfig.client) {
                case 'mysql':
                    console.log(colors.white(`  Host\t\t\t\t\t\t`) + colors.gray(`${connectionConfig.connection.host}`));
                    console.log(colors.white(`  Port\t\t\t\t\t\t`) + colors.gray(`${connectionConfig.connection.port}`));
                    console.log(colors.white(`  Database\t\t\t\t\t`) + colors.gray(`${connectionConfig.connection.database}`));
                    break;
                case 'mssql':
                    console.log(colors.white(`  Host\t\t\t\t\t\t`) + colors.gray(`${connectionConfig.connection.server}`));
                    console.log(colors.white(`  Port\t\t\t\t\t\t`) + colors.gray(`${connectionConfig.connection.port}`));
                    console.log(colors.white(`  Database\t\t\t\t\t`) + colors.gray(`${connectionConfig.connection.database}`));
                    break;
                case 'sqlite3':
                    console.log(colors.white(`  Database File\t\t\t\t\t`) + colors.gray(`${connectionConfig.connection.filename}`));
                    break;
            }

            // Check connection
            try {
                const dbClient = Database.getConnection(connectionName).client;
                await dbClient.raw('SELECT 1');
                console.log(colors.white(`  Connection Status\t\t\t\t`) + colors.green(`[OK]`));
            } catch (error) {
                console.log(colors.white(`  Connection Status\t\t\t\t`) + colors.red(`[CRIT] ${error.message}`));
            }
            console.log();
        }

        // ****************************************************
        // ****************************************************
        // ********************** LOG *************************
        // ****************************************************
        // ****************************************************

        const loggingConfig = require(process.cwd() + '/build/config/logging').default;
        console.log(colors.underline.bold.bgGreen('Logging information'));
        console.log(colors.white(`  Log Files Path\t\t\t\t`) + colors.gray(`${loggingConfig.logFilesDirectory}`));
        console.log(colors.white(`  Log Level\t\t\t\t\t`) + colors.gray(`${loggingConfig.logLevel}`));
        console.log(colors.white(`  Log To Console\t\t\t\t`) + colors.green(`[${(loggingConfig.enableLoggingToConsole ? 'YES' : 'NO')}]`));
        console.log(colors.white(`  Log To Files\t\t\t\t\t`) + colors.green(`[${(loggingConfig.enableLoggingToFiles ? 'YES' : 'NO')}]`));
        console.log();

        // ****************************************************
        // ****************************************************
        // ********************* CACHE ************************
        // ****************************************************
        // ****************************************************

        const cacheConfig = require(process.cwd() + '/build/config/cache').default;
        console.log(colors.underline.bold.bgGreen('Cache information'));
        console.log(colors.white(`  Driver\t\t\t\t\t`) + colors.gray(`${cacheConfig.driver}`));
        console.log(colors.white(`  Default Cache TTL\t\t\t\t`) + colors.gray(`${cacheConfig.defaultTTLInSeconds}`));
        console.log(colors.white(`  Seconds After Cache Expiration Will Execute\t`) + colors.gray(`${cacheConfig.checkperiodInSeconds}`));

        switch (cacheConfig.driver) {
            case 'fs':
                console.log(colors.white(`  Cache File Path\t\t\t\t`) + colors.gray(`${cacheConfig.driverConfiguration.fs.filePath}`));
                break;
            case 'redis':
                console.log(colors.white(`  Redis Host\t\t\t\t\t`) + colors.gray(`${cacheConfig.driverConfiguration.redis.host}`));
                console.log(colors.white(`  Redis Port\t\t\t\t\t`) + colors.gray(`${cacheConfig.driverConfiguration.redis.port}`));
                const checkRedisConnection1 = async () => {
                    try {
                        const client = createClient({
                            url: `redis://${cacheConfig.driverConfiguration.redis.host}:${cacheConfig.driverConfiguration.redis.port}`,
                            // Disable reconnection attempts
                            socket: {
                                reconnectStrategy: () => false
                            }
                        });
                        await client.connect();
                        console.log(colors.white(`  Connection Status\t\t\t\t`) + colors.green(`[OK]`));

                        // Quit the client after the connection is established, since we do not need it here, it's just
                        // For testing the connection
                        await client.quit();
                    } catch (error) {
                        // Catch any errors from the connection or quit
                        console.log(colors.white(`  Connection Status\t\t\t\t`) + colors.red(`[CRIT] ${error.message}`));
                    }
                };
                await checkRedisConnection1();
        }
        console.log();

        // ****************************************************
        // ****************************************************
        // **************** DOCUMENTATION *********************
        // ****************************************************
        // ****************************************************

        const documentationConfig = require(process.cwd() + '/build/config/documentation').default;
        console.log(colors.underline.bold.bgGreen('Documentation information'));
        console.log(colors.white(`  Basic Auth Enabled\t\t\t\t`) + colors.green(`[${(documentationConfig.basicAuth.enabled ? 'YES' : 'NO')}]`));
        console.log(colors.white(`  Basic Auth Username\t\t\t\t`) + colors.gray(`${documentationConfig.basicAuth.user}`));
        console.log(colors.white(`  Basic Auth Password\t\t\t\t`) + colors.gray(`${documentationConfig.basicAuth.pass}`));
        console.log(colors.white(`  Url\t\t\t\t\t\t`) + colors.gray(`http://127.0.0.1:${process.env.LISTEN_PORT}/docs`));
        console.log();

        // ****************************************************
        // ****************************************************
        // ********************* QUEUE ************************
        // ****************************************************
        // ****************************************************

        const queueConfig = require(process.cwd() + '/build/config/queue').default;
        console.log(colors.underline.bold.bgGreen('Queue information'));
        console.log(colors.white(`  Redis Host\t\t\t\t\t`) + colors.gray(`${queueConfig.redis.host}`));
        console.log(colors.white(`  Redis Port\t\t\t\t\t`) + colors.gray(`${queueConfig.redis.port}`));
        const checkRedisConnection2 = async () => {
            try {
                const client = createClient({
                    url: `redis://${queueConfig.redis.host}:${queueConfig.redis.port}`,
                    // Disable reconnection attempts
                    socket: {
                        reconnectStrategy: () => false
                    }
                });
                await client.connect();
                console.log(colors.white(`  Connection Status\t\t\t\t`) + colors.green(`[OK]`));

                // Quit the client after the connection is established, since we do not need it here, it's just
                // For testing the connection
                await client.quit();
            } catch (error) {
                // Catch any errors from the connection or quit
                console.log(colors.white(`  Connection Status\t\t\t\t`) + colors.red(`[CRIT] ${error.message}`));
            }
        };
        await checkRedisConnection2();
        console.log();

        // ****************************************************
        // ****************************************************
        // ******************* SESSIONS ***********************
        // ****************************************************
        // ****************************************************

        const sessionConfig = require(process.cwd() + '/build/config/session').default;
        console.log(colors.underline.bold.bgGreen('Session information'));
        console.log(colors.white(`  Sessions Enabled\t\t\t\t`) + colors.green(`[${(sessionConfig.enabled ? 'YES' : 'NO')}]`));
        console.log(colors.white(`  Sessions Driver\t\t\t\t`) + colors.gray(`${sessionConfig.driver}`));
        switch (sessionConfig.driver) {
            case 'file':
                console.log(colors.white(`  Session Files Path\t\t\t\t`) + colors.gray(`${sessionConfig.drivers.file.path}`));
                break;
            case 'redis':
                console.log(colors.white(`  Redis Host\t\t\t\t\t`) + colors.gray(`${cacheConfig.driverConfiguration.redis.host}`));
                console.log(colors.white(`  Redis Port\t\t\t\t\t`) + colors.gray(`${cacheConfig.driverConfiguration.redis.port}`));
                const checkRedisConnection3 = async () => {
                    try {
                        const client = createClient({
                            url: `redis://${sessionConfig.drivers.redis.host}:${sessionConfig.drivers.redis.port}`,
                            // Disable reconnection attempts
                            socket: {
                                reconnectStrategy: () => false
                            }
                        });
                        await client.connect();
                        console.log(colors.white(`  Connection Status\t\t\t\t`) + colors.green(`[OK]`));

                        // Quit the client after the connection is established, since we do not need it here, it's just
                        // For testing the connection
                        await client.quit();
                    } catch (error) {
                        // Catch any errors from the connection or quit
                        console.log(colors.white(`  Connection Status\t\t\t\t`) + colors.red(`[CRIT] ${error.message}`));
                    }
                };
                await checkRedisConnection3();
        }
        console.log();
        console.log();
        console.log();
    }
}
