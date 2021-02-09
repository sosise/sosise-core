import { Command, version } from 'commander';
import Controller from './Artisan/Make/Controller';
import Unifier from './Artisan/Make/Unifier';
import Migrate from './Artisan/Migrate/Migrate';
import Migration from './Artisan/Make/Migration';
import Service from './Artisan/Make/Service';
import Repository from './Artisan/Make/Repository';
import MakeCommand from './Artisan/Make/Command';
import Middleware from './Artisan/Make/Middleware';
import Type from './Artisan/Make/Type';
import Enum from './Artisan/Make/Enum';
import CommandRegistration from './Command/CommandRegistration';
import Exception from './Artisan/Make/Exception';
import fs from 'fs';
import path from 'path';
import figlet from 'figlet';
import Config from './Artisan/Make/Config';
import Test from './Artisan/Make/Test';

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
            const versionString = `          sosise-core: ${JSON.parse(packageJsonFileContent).version}`.dim;

            command
                .name('./artisan'.green)
                .description(`${artisanString}\n${versionString}`)
                .usage('[command] [options]'.green)
                .addHelpCommand('help [command]', 'Display help for command'.dim);

            // Register available commands
            const commandRegistration = new CommandRegistration(command);
            commandRegistration.registerApplicationCommands();

            // Make commands
            command.command('');
            command.command('Make'.green);

            command
                .command('make:controller <name>')
                .description('Create a new controller'.dim)
                .action((name) => {
                    const instance = new Controller(name);
                    instance.createFile();
                });

            command
                .command('make:unifier <name>')
                .description('Create a new unifier'.dim)
                .action((name) => {
                    const instance = new Unifier(name);
                    instance.createFile();
                });

            command
                .command('make:migration <name>')
                .description('Create a new database migration'.dim)
                .option('-c, --create', 'Migration will create table'.dim)
                .option('-u, --update', 'Migration will update table'.dim)
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
                .command('make:service <name>')
                .description('Create a new service'.dim)
                .action((name) => {
                    const instance = new Service(name);
                    instance.createFile();
                });

            command
                .command('make:repository <name>')
                .option('-t, --test', 'Make test repository also'.dim)
                .description('Create a new repository and repository interface'.dim)
                .action((name, options) => {
                    const instance = new Repository(name);
                    instance.createRepositoryFile();
                    instance.createRepositoryInterfaceFile();

                    // Create a test repository if needed
                    if (options.test) {
                        instance.createTestRepositoryFile();
                    }
                });

            command
                .command('make:command <name>')
                .description('Create a new command'.dim)
                .action((name) => {
                    const instance = new MakeCommand(name);
                    instance.createFile();
                });

            command
                .command('make:middleware <name>')
                .description('Create a new middleware'.dim)
                .action((name) => {
                    const instance = new Middleware(name);
                    instance.createFile();
                });

            command
                .command('make:type <name>')
                .description('Create a new type interface'.dim)
                .action((name) => {
                    const instance = new Type(name);
                    instance.createFile();
                });

            command
                .command('make:enum <name>')
                .description('Create a new enum'.dim)
                .action((name) => {
                    const instance = new Enum(name);
                    instance.createFile();
                });

            command
                .command('make:exception <name>')
                .description('Create a new exception'.dim)
                .action((name) => {
                    const instance = new Exception(name);
                    instance.createFile();
                });

            command
                .command('make:config <name>')
                .description('Create a new config'.dim)
                .action((name) => {
                    const instance = new Config(name);
                    instance.createFile();
                });

            command
                .command('make:test <name>')
                .description('Create a new test'.dim)
                .option('-u, --unit', 'Make unit test'.dim)
                .option('-f, --functional', 'Make unit test'.dim)
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

            // Make commands
            command.command('');
            command.command('Migrate'.green);

            command
                .command('migrate')
                .description('Run the database migrations'.dim)
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
                .description('Rollback the last database migration'.dim)
                .option('-f, --force', 'Force dropping all tables and re-run all migrations', false)
                .action(async (cli) => {
                    try {
                        // Stop the command if env is NOT local and no force is used
                        if (process.env.APP_ENV !== 'local' && !cli.force) {
                            console.log(`Attention! You are in ${process.env.APP_ENV} environment, if you still want to run this command use -f or --force flag`.red);
                            console.log(`See ./artisan migrate:rollback --help for more information`.dim);
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
                .description('Drop all tables and re-run all migrations'.dim)
                .option('-f, --force', 'Force dropping all tables and re-run all migrations', false)
                .action(async (cli) => {
                    try {
                        // Stop the command if env is NOT local and no force is used
                        if (process.env.APP_ENV !== 'local' && !cli.force) {
                            console.log(`Attention! You are in ${process.env.APP_ENV} environment, if you still want to run this command use -f or --force flag`.red);
                            console.log(`See ./artisan migrate:fresh --help for more information`.dim);
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
            command.command('Help'.green);

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
