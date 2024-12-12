import colors from 'colors';
import fs from 'fs';
import MakeException from '../../Exceptions/Artisan/MakeException';

export default class Test {
    protected unitTestTemplatePath = __dirname + '/../FileTemplates/UnitTestTemplate.txt';
    protected unitTestsPath = 'src/tests/Unit';
    protected functionalTestTemplatePath = __dirname + '/../FileTemplates/FunctionalTestTemplate.txt';
    protected functionalTestsPath = 'src/tests/Functional';

    protected name: string;

    /**
     * Constructor
     */
    constructor(name: string) {
        this.name = name;
    }

    /**
     * Create unit test file
     */
    public createUnitTestFile(): void {
        try {
            const templateFileContent = fs.readFileSync(this.unitTestTemplatePath, 'utf8');
            const pathOfNewFile = `${process.cwd()}/${this.unitTestsPath}/${this.name}.spec.ts`;
            this.throwExceptionIfFileAlreadyExists(pathOfNewFile);
            fs.writeFileSync(pathOfNewFile, templateFileContent);
            console.log(colors.green('Created Unit Test:'), `${this.unitTestsPath}/${this.name}.spec.ts`);
        } catch (error) {
            throw new MakeException(error.message);
        }
    }

    /**
     * Create functional test file
     */
    public createFunctionalTestFile(): void {
        try {
            const templateFileContent = fs.readFileSync(this.functionalTestTemplatePath, 'utf8');
            const pathOfNewFile = `${process.cwd()}/${this.functionalTestsPath}/${this.name}.spec.ts`;
            this.throwExceptionIfFileAlreadyExists(pathOfNewFile);
            fs.writeFileSync(pathOfNewFile, templateFileContent);
            console.log(colors.green('Created Functional Test:'), `${this.functionalTestsPath}/${this.name}.spec.ts`);
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
