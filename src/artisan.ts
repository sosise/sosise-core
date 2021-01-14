import { Command } from 'commander';
// import Handler from './app/Exceptions/Handler';
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
    // TODO
    public run(argv: string[]): void {
        try {
            // Initialize commander
            const program = new Command();

            // Register available commands
            const commandRegistration = new CommandRegistration(program);
            commandRegistration.registerApplicationCommands();

            program
                .command('make:controller <name>')
                .description('Create a new controller class')
                .action((name) => {
                    const instance = new Controller(name);
                    instance.createFile();
                });

            program
                .command('make:unifier <name>')
                .description('Create a new unifier class')
                .action((name) => {
                    const instance = new Unifier(name);
                    instance.createFile();
                });

            program
                .command('make:migration <name>')
                .description('Create a new database migration')
                .option('-c, --create', 'Migration will create table')
                .option('-u, --update', 'Migration will update table')
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
                .description('Create a new service class')
                .action((name) => {
                    const instance = new Service(name);
                    instance.createFile();
                });

            program
                .command('make:repository <name>')
                .description('Create a new repository and repository interface classes')
                .action((name) => {
                    const instance = new Repository(name);
                    instance.createRepositoryFile();
                    instance.createRepositoryInterfaceFile();
                });

            program
                .command('make:command <name>')
                .description('Create a new command class')
                .action((name) => {
                    const instance = new MakeCommand(name);
                    instance.createFile();
                });

            program
                .command('make:middleware <name>')
                .description('Create a new middleware class')
                .action((name) => {
                    const instance = new Middleware(name);
                    instance.createFile();
                });

            program
                .command('make:type <name>')
                .description('Create a new type interface')
                .action((name) => {
                    const instance = new Type(name);
                    instance.createFile();
                });

            program
                .command('make:enum <name>')
                .description('Create a new enum')
                .action((name) => {
                    const instance = new Enum(name);
                    instance.createFile();
                });

            program
                .command('migrate')
                .description('Run the database migrations')
                .action(async () => {
                    try {
                        const instance = new Migrate();
                        await instance.createMigrationsTableIfNeeded();
                        await instance.run();
                        process.exit(0);
                    } catch (error) {
                        // TODO Debug (remove it)
                        console.log(error);
                        process.exit(0);
                        // const exceptionHandler = new Handler();
                        // exceptionHandler.reportCommandException(error);
                        // process.exit(0);
                    }
                });

            program
                .command('migrate:rollback')
                .description('Rollback the last database migration')
                .action(async () => {
                    try {
                        const instance = new Migrate();
                        await instance.createMigrationsTableIfNeeded();
                        await instance.rollback();
                        process.exit(0);
                    } catch (error) {
                        // TODO Debug (remove it)
                        console.log(error);
                        process.exit(0);
                        // const exceptionHandler = new Handler();
                        // exceptionHandler.reportCommandException(error);
                        // process.exit(0);
                    }
                });

            // Parse cli arguments and execute actions
            program.parse(argv);
        }
        catch (error) {
            // TODO Debug (remove it)
            console.log(error);
            process.exit(0);
            // const exceptionHandler = new Handler();
            // exceptionHandler.reportCommandException(error);
            // process.exit(0);
        }
    }
}
