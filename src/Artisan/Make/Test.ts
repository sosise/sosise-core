import fs from 'fs';
import colors from 'colors';
import MakeException from '../../Exceptions/Artisan/MakeException';

export default class Test {
    protected unitTestTemplatePath = __dirname + '/../FileTemplates/UnitTest.txt';
    protected unitTestsPath = 'src/tests/unit';
    protected functionalTestTemplatePath = __dirname + '/../FileTemplates/FunctionalTest.txt';
    protected functionalTestsPath = 'src/tests/functional';

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
