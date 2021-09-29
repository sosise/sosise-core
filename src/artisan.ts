import colors from 'colors';
import CommandRegistration from './Command/CommandRegistration';
import Config from './Artisan/Make/Config';
import Controller from './Artisan/Make/Controller';
import Enum from './Artisan/Make/Enum';
import Exception from './Artisan/Make/Exception';
import figlet from 'figlet';
import fs from 'fs';
import MakeCommand from './Artisan/Make/Command';
import MakeSeed from './Artisan/Make/Seed';
import Middleware from './Artisan/Make/Middleware';
import Migrate from './Artisan/Migrate/Migrate';
import Migration from './Artisan/Make/Migration';
import path from 'path';
import QueueHandler from './Artisan/Queue/QueueHandler';
import QueueWorker from './Artisan/Make/QueueWorker';
import Repository from './Artisan/Make/Repository';
import Seed from './Artisan/Seed/Seed';
import Service from './Artisan/Make/Service';
import Test from './Artisan/Make/Test';
import Type from './Artisan/Make/Type';
import Unifier from './Artisan/Make/Unifier';
import { Command, option, version } from 'commander';

export default class Artisan {
    /**
     * Artisan main entry method
     */
    public run(argv: string[]): void {
        try {
            // Initialize commander
            const command = new Command();

            // Get version of the sosise-core
            const packageJsonFileContent = fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8');
            const artisanString = figlet.textSync('Artisan').magenta;
            const versionString = colors.dim(`          sosise-core: ${JSON.parse(packageJsonFileContent).version}`);

            command
                .name(colors.green('./artisan'))
                .description(`${artisanString}\n${versionString}`)
                .usage(colors.green('[command] [options]'))
                .addHelpCommand('help [command]', colors.dim('Display help for command'));

            // Register available commands
            const commandRegistration = new CommandRegistration(command);
            commandRegistration.registerApplicationCommands();

            // Make commands
            command.command('');
            command.command(colors.green('Make'));

            command
                .command('make:controller <name>')
                .description(colors.dim('Create a new controller'))
                .action((name) => {
                    const instance = new Controller(name);
                    instance.createFile();
                });

            command
                .command('make:unifier <name>')
                .description(colors.dim('Create a new unifier'))
                .action((name) => {
                    const instance = new Unifier(name);
                    instance.createFile();
                });

            command
                .command('make:migration <name>')
                .description(colors.dim('Create a new database migration'))
                .option('-c, --create', colors.dim('Migration will create table'))
                .option('-u, --update', colors.dim('Migration will update table'))
                .action((name, options) => {
                    // If user wants to use creation migration
                    if (options.create) {
                        const migrationCreate = new Migration(name);
                        migrationCreate.createMigrationForTableCreation();
                        return;
                    }

                    // If user wants to use update migration
                    if (options.update) {
                        const migrationUpdate = new Migration(name);
                        migrationUpdate.createMigrationForTableUpdation();
                        return;
                    }

                    // If nothing specified, we assume that user wants to use creation migration
                    const instance = new Migration(name);
                    instance.createMigrationForTableCreation();
                });

            command
                .command('make:seed <name>')
                .description(colors.dim('Create a new seed'))
                .action((name) => {
                    const instance = new MakeSeed(name);
                    instance.createFile();
                });

            command
                .command('make:service <name>')
                .description(colors.dim('Create a new service'))
                .action((name) => {
                    const instance = new Service(name);
                    instance.createFile();
                });

            command
                .command('make:repository <name>')
                .option('-t, --test', colors.dim('Make test repository also'))
                .option('-h, --http', colors.dim('Make repository, with an http client'))
                .description(colors.dim('Create a new repository and repository interface'))
                .action((name, options) => {
                    const instance = new Repository(name);

                    // Determine which repository to create
                    if (options.http) {
                        instance.createHttpRepositoryFile();
                    } else {
                        instance.createDatabaseRepositoryFile();
                    }

                    // Interface is always the same
                    instance.createRepositoryInterfaceFile();

                    // Create a test repository if needed
                    if (options.test) {
                        instance.createTestRepositoryFile();
                    }
                });

            command
                .command('make:command <name>')
                .description(colors.dim('Create a new command'))
                .action((name) => {
                    const instance = new MakeCommand(name);
                    instance.createFile();
                });

            command
                .command('make:middleware <name>')
                .description(colors.dim('Create a new middleware'))
                .action((name) => {
                    const instance = new Middleware(name);
                    instance.createFile();
                });

            command
                .command('make:type <name>')
                .description(colors.dim('Create a new type interface'))
                .action((name) => {
                    const instance = new Type(name);
                    instance.createFile();
                });

            command
                .command('make:enum <name>')
                .description(colors.dim('Create a new enum'))
                .action((name) => {
                    const instance = new Enum(name);
                    instance.createFile();
                });

            command
                .command('make:exception <name>')
                .description(colors.dim('Create a new exception'))
                .action((name) => {
                    const instance = new Exception(name);
                    instance.createFile();
                });

            command
                .command('make:config <name>')
                .description(colors.dim('Create a new config'))
                .action((name) => {
                    const instance = new Config(name);
                    instance.createFile();
                });

            command
                .command('make:test <name>')
                .description(colors.dim('Create a new test'))
                .option('-u, --unit', colors.dim('Make unit test'))
                .option('-f, --functional', colors.dim('Make unit test'))
                .action((name, options) => {
                    const instance = new Test(name);

                    // Create Unit test if user wants to do that
                    if (options.unit) {
                        instance.createUnitTestFile();
                        return;
                    }

                    // Create Unit test if user wants to do that
                    if (options.functional) {
                        instance.createFunctionalTestFile();
                        return;
                    }

                    // If nothing specified, we assume that user wants create unit test
                    instance.createUnitTestFile();
                });

            command
                .command('make:queueworker <name>')
                .description(colors.dim('Create a new queue worker'))
                .action((name) => {
                    const instance = new QueueWorker(name);
                    instance.createFile();
                });

            // Make commands
            command.command('');
            command.command(colors.green('Migrate'));

            command
                .command('migrate')
                .description(colors.dim('Run the database migrations'))
                .action(async () => {
                    try {
                        const instance = new Migrate();
                        await instance.createMigrationsTableIfNeeded();
                        await instance.run();
                        process.exit(0);
                    } catch (error) {
                        const Handler = require(process.cwd() + '/build/app/Exceptions/Handler').default;
                        const exceptionHandler = new Handler();
                        exceptionHandler.reportCommandException(error).then(() => {
                            process.exit(1);
                        });
                    }
                });

            command
                .command('migrate:rollback')
                .description(colors.dim('Rollback the last database migration'))
                .option('-f, --force', 'Force dropping all tables and re-run all migrations', false)
                .action(async (cli) => {
                    try {
                        // Stop the command if env is NOT local and no force is used
                        if (process.env.APP_ENV !== 'local' && !cli.force) {
                            console.log(colors.red(`Attention! You are in ${process.env.APP_ENV} environment, if you still want to run this command use -f or --force flag`));
                            console.log(colors.dim(`See ./artisan migrate:rollback --help for more information`));
                            process.exit(0);
                        }
                        const instance = new Migrate();
                        await instance.createMigrationsTableIfNeeded();
                        await instance.rollback();
                        process.exit(0);
                    } catch (error) {
                        const Handler = require(process.cwd() + '/build/app/Exceptions/Handler').default;
                        const exceptionHandler = new Handler();
                        exceptionHandler.reportCommandException(error).then(() => {
                            process.exit(1);
                        });
                    }
                });

            command
                .command('migrate:fresh')
                .description(colors.dim('Drop all tables and re-run all migrations'))
                .option('-f, --force', 'Force dropping all tables and re-run all migrations', false)
                .action(async (cli) => {
                    try {
                        // Stop the command if env is NOT local and no force is used
                        if (process.env.APP_ENV !== 'local' && !cli.force) {
                            console.log(colors.red(`Attention! You are in ${process.env.APP_ENV} environment, if you still want to run this command use -f or --force flag`));
                            console.log(colors.dim(`See ./artisan migrate:fresh --help for more information`));
                            process.exit(0);
                        }
                        const instance = new Migrate();
                        await instance.fresh();
                        process.exit(0);
                    } catch (error) {
                        const Handler = require(process.cwd() + '/build/app/Exceptions/Handler').default;
                        const exceptionHandler = new Handler();
                        exceptionHandler.reportCommandException(error).then(() => {
                            process.exit(1);
                        });
                    }
                });

            // Make commands
            command.command('');
            command.command(colors.green('Seed'));

            command
                .command('seed')
                .description(colors.dim('Run the database seeds'))
                .option('-f, --force', 'Force seeding even if seeds are restricted to be run in a local environment', false)
                .action(async (cli) => {
                    try {
                        const instance = new Seed(cli);
                        await instance.run();
                        process.exit(0);
                    } catch (error) {
                        const Handler = require(process.cwd() + '/build/app/Exceptions/Handler').default;
                        const exceptionHandler = new Handler();
                        exceptionHandler.reportCommandException(error).then(() => {
                            process.exit(1);
                        });
                    }
                });

            // Make commands
            command.command('');
            command.command(colors.green('Queue'));

            command
                .command('queue:listen <queueName>')
                .description(colors.dim('Listen to a given queue'))
                .action(async (queueName) => {
                    try {
                        const instance = new QueueHandler();
                        await instance.listen(queueName);
                    } catch (error) {
                        const Handler = require(process.cwd() + '/build/app/Exceptions/Handler').default;
                        const exceptionHandler = new Handler();
                        exceptionHandler.reportCommandException(error).then(() => {
                            process.exit(1);
                        });
                    }
                });

            command
                .command('queue:list <queueName>')
                .description(colors.dim('List jobs in a queue'))
                .action(async (queueName) => {
                    try {
                        // Log
                        console.log(colors.magenta(`Inspecting queue "${queueName}"`));
                        console.log('');

                        const instance = new QueueHandler();
                        await instance.listFailedJobs(queueName);
                        await instance.listWaitingJobs(queueName);
                        await instance.listDelayedJobs(queueName);
                        await instance.listCompletedJobs(queueName);
                        await instance.listActiveJobs(queueName);

                        process.exit(0);
                    } catch (error) {
                        const Handler = require(process.cwd() + '/build/app/Exceptions/Handler').default;
                        const exceptionHandler = new Handler();
                        exceptionHandler.reportCommandException(error).then(() => {
                            process.exit(1);
                        });
                    }
                });

            command
                .command('queue:retry <queueName>')
                .description(colors.dim('Retry all jobs marked as failed'))
                .action(async (queueName) => {
                    try {
                        const instance = new QueueHandler();
                        await instance.retryFailedByQueueName(queueName);
                        process.exit(0);
                    } catch (error) {
                        const Handler = require(process.cwd() + '/build/app/Exceptions/Handler').default;
                        const exceptionHandler = new Handler();
                        exceptionHandler.reportCommandException(error).then(() => {
                            process.exit(1);
                        });
                    }
                });

            command
                .command('queue:flush <queueName>')
                .description(colors.dim('Flush all jobs marked as failed'))
                .action(async (queueName) => {
                    try {
                        const instance = new QueueHandler();
                        await instance.flushFailed(queueName);
                        process.exit(0);
                    } catch (error) {
                        const Handler = require(process.cwd() + '/build/app/Exceptions/Handler').default;
                        const exceptionHandler = new Handler();
                        exceptionHandler.reportCommandException(error).then(() => {
                            process.exit(1);
                        });
                    }
                });

            // Make commands
            command.command('');
            command.command(colors.green('Help'));

            // Parse cli arguments and execute actions
            command.parse(argv);
        }
        catch (error) {
            const Handler = require(process.cwd() + '/build/app/Exceptions/Handler').default;
            const exceptionHandler = new Handler();
            exceptionHandler.reportCommandException(error).then(() => {
                process.exit(1);
            });
        }
    }
}
