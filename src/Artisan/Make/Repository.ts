import colors from 'colors';
import fs from 'fs';
import MakeException from '../../Exceptions/Artisan/MakeException';

export default class Repository {
    protected repositoryDatabaseTemplatePath = __dirname + '/../FileTemplates/RepositoryDatabaseTemplate.txt';
    protected repositoryHttpTemplatePath = __dirname + '/../FileTemplates/RepositoryHttpTemplate.txt';
    protected repositoryInterfaceTemplatePath = __dirname + '/../FileTemplates/RepositoryInterfaceTemplate.txt';
    protected testRepositoryTemplatePath = __dirname + '/../FileTemplates/TestRepositoryTemplate.txt';
    protected createPath = 'src/app/Repositories';
    protected testRepositoriesDirPath = 'src/tests/Repositories';
    protected name: string;

    /**
     * Constructor
     */
    constructor(name: string) {
        this.name = name;
    }

    /**
     * Create database repository file
     */
    public createDatabaseRepositoryFile(): void {
        try {
            let templateFileContent = fs.readFileSync(this.repositoryDatabaseTemplatePath, 'utf8');
            templateFileContent = templateFileContent.replace(
                new RegExp('%name%', 'g'),
                this.name.charAt(0).toUpperCase() + this.name.slice(1),
            );
            const pathOfNewFile = `${process.cwd()}/${this.createPath}/${this.name}.ts`;
            this.throwExceptionIfFileAlreadyExists(pathOfNewFile);
            fs.writeFileSync(pathOfNewFile, templateFileContent);
            console.log(colors.green('Created Repository:'), `${this.createPath}/${this.name}.ts`);
        } catch (error) {
            throw new MakeException(error.message);
        }
    }

    /**
     * Create http repository file
     */
    public createHttpRepositoryFile(): void {
        try {
            let templateFileContent = fs.readFileSync(this.repositoryHttpTemplatePath, 'utf8');
            templateFileContent = templateFileContent.replace(
                new RegExp('%name%', 'g'),
                this.name.charAt(0).toUpperCase() + this.name.slice(1),
            );
            const pathOfNewFile = `${process.cwd()}/${this.createPath}/${this.name}.ts`;
            this.throwExceptionIfFileAlreadyExists(pathOfNewFile);
            fs.writeFileSync(pathOfNewFile, templateFileContent);
            console.log(colors.green('Created Repository:'), `${this.createPath}/${this.name}.ts`);
        } catch (error) {
            throw new MakeException(error.message);
        }
    }

    /**
     * Create repository interface file
     */
    public createRepositoryInterfaceFile(): void {
        try {
            let templateFileContent = fs.readFileSync(this.repositoryInterfaceTemplatePath, 'utf8');
            const interfaceName = this.name + 'Interface';
            templateFileContent = templateFileContent.replace(
                '%name%',
                interfaceName.charAt(0).toUpperCase() + interfaceName.slice(1),
            );
            const pathOfNewFile = `${process.cwd()}/${this.createPath}/${interfaceName}.ts`;
            this.throwExceptionIfFileAlreadyExists(pathOfNewFile);
            fs.writeFileSync(pathOfNewFile, templateFileContent);
            console.log(colors.green('Created Repository Interface:'), `${this.createPath}/${interfaceName}.ts`);
        } catch (error) {
            throw new MakeException(error.message);
        }
    }

    /**
     * Create test repository file
     */
    public createTestRepositoryFile(): void {
        try {
            let templateFileContent = fs.readFileSync(this.testRepositoryTemplatePath, 'utf8');
            templateFileContent = templateFileContent.replace(
                new RegExp('%name%', 'g'),
                this.name.charAt(0).toUpperCase() + this.name.slice(1),
            );
            const pathOfNewFile = `${process.cwd()}/${this.testRepositoriesDirPath}/${this.name}.ts`;
            this.throwExceptionIfFileAlreadyExists(pathOfNewFile);
            fs.writeFileSync(pathOfNewFile, templateFileContent);
            console.log(colors.green('Created Test Repository:'), `${this.testRepositoriesDirPath}/${this.name}.ts`);
        } catch (error) {
            throw new MakeException(error.message);
        }
    }

    /**
     * Throw exception if file already exists
     */
    private throwExceptionIfFileAlreadyExists(filePath: string): void {
        if (fs.existsSync(filePath)) {
            console.log(colors.red(`File already exists ${filePath}`));
            process.exit(0);
        }
    }
}
