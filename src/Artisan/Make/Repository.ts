import fs from 'fs';
import colors from 'colors';
import MakeException from '../../Exceptions/Artisan/MakeException';

export default class Repository {

    protected repositoryTemplatePath = __dirname + '/../FileTemplates/RepositoryTemplate.txt';
    protected repositoryInterfaceTemplatePath = __dirname + '/../FileTemplates/RepositoryInterfaceTemplate.txt';
    protected createPath = 'src/app/Repositories';
    protected name: string;

    /**
     * Constructor
     */
    constructor(name: string) {
        this.name = name;
    }

    /**
     * Create repository file
     */
    public createRepositoryFile(): void {
        try {
            let templateFileContent = fs.readFileSync(this.repositoryTemplatePath, 'utf8');
            templateFileContent = templateFileContent.replace(new RegExp('%name%', 'g'), this.name.charAt(0).toUpperCase() + this.name.slice(1));
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
            this.name += 'Interface';
            templateFileContent = templateFileContent.replace('%name%', this.name.charAt(0).toUpperCase() + this.name.slice(1));
            const pathOfNewFile = `${process.cwd()}/${this.createPath}/${this.name}.ts`;
            this.throwExceptionIfFileAlreadyExists(pathOfNewFile);
            fs.writeFileSync(pathOfNewFile, templateFileContent);
            console.log(colors.green('Created Repository Interface:'), `${this.createPath}/${this.name}.ts`);
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
