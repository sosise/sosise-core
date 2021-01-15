import { Command } from 'commander';
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

export default class Artisan {
    /**
     * Artisan main entry method
     */
    public run(argv: string[]): void {
        try {
            // Initialize commander
            const program = new Command();

            program
                .name('./artisan'.green)
                .usage('[command] [options]'.green)
                .helpOption(false)
                .addHelpCommand('help [command]', 'Display help for command'.dim);

            // Register available commands
            const commandRegistration = new CommandRegistration(program);
            if (commandRegistration.listOfCommandFiles.length > 0) {
                program.command('');
                program.command('User:'.green);
                commandRegistration.registerApplicationCommands();
            }

            // Artisan commands
            program.command('');
            program.command('Artisan:'.green);

            program
                .command('make:controller <name>')
                .description('Create a new controller'.dim)
                .action((name) => {
                    const instance = new Controller(name);
                    instance.createFile();
                });

            program
                .command('make:unifier <name>')
                .description('Create a new unifier'.dim)
                .action((name) => {
                    const instance = new Unifier(name);
                    instance.createFile();
                });

            program
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

            program
                .command('make:service <name>')
                .description('Create a new service'.dim)
                .action((name) => {
                    const instance = new Service(name);
                    instance.createFile();
                });

            program
                .command('make:repository <name>')
                .description('Create a new repository and repository interface'.dim)
                .action((name) => {
                    const instance = new Repository(name);
                    instance.createRepositoryFile();
                    instance.createRepositoryInterfaceFile();
                });

            program
                .command('make:command <name>')
                .description('Create a new command'.dim)
                .action((name) => {
                    const instance = new MakeCommand(name);
                    instance.createFile();
                });

            program
                .command('make:middleware <name>')
                .description('Create a new middleware'.dim)
                .action((name) => {
                    const instance = new Middleware(name);
                    instance.createFile();
                });

            program
                .command('make:type <name>')
                .description('Create a new type interface'.dim)
                .action((name) => {
                    const instance = new Type(name);
                    instance.createFile();
                });

            program
                .command('make:enum <name>')
                .description('Create a new enum'.dim)
                .action((name) => {
                    const instance = new Enum(name);
                    instance.createFile();
                });

            program.command(''); // Blanc line

            program
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
                        exceptionHandler.reportCommandException(error);
                        process.exit(0);
                    }
                });

            program
                .command('migrate:rollback')
                .description('Rollback the last database migration'.dim)
                .action(async () => {
                    try {
                        const instance = new Migrate();
                        await instance.createMigrationsTableIfNeeded();
                        await instance.rollback();
                        process.exit(0);
                    } catch (error) {
                        const Handler = require(process.cwd() + '/build/app/Exceptions/Handler').default;
                        const exceptionHandler = new Handler();
                        exceptionHandler.reportCommandException(error);
                        process.exit(0);
                    }
                });

            program.command(''); // Blanc line

            // Parse cli arguments and execute actions
            program.parse(argv);
        }
        catch (error) {
            const Handler = require(process.cwd() + '/build/app/Exceptions/Handler').default;
            const exceptionHandler = new Handler();
            exceptionHandler.reportCommandException(error);
            process.exit(0);
        }
    }
}
