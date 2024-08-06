import colors from "colors";
import fs from "fs";
import MakeException from "../../Exceptions/Artisan/MakeException";

export default abstract class Base {

    protected abstract templatePath: string;
    protected abstract createPath: string;
    protected name: string;

    /**
     * Constructor
     */
    constructor(name: string) {
        this.name = name;
    }

    /**
     * Create file
     */
    public createFile(): void {
        try {
            let templateFileContent = fs.readFileSync(this.templatePath, 'utf8');
            templateFileContent = templateFileContent.replace(new RegExp('%name%', 'g'), this.name.charAt(0).toUpperCase() + this.name.slice(1));
            const pathOfNewFile = `${process.cwd()}/${this.createPath}/${this.name}.ts`;
            this.throwExceptionIfFileAlreadyExists(pathOfNewFile);
            fs.writeFileSync(pathOfNewFile, templateFileContent);
            console.log(colors.green(`Created ${this.constructor.name}:`), `${this.createPath}/${this.name}.ts`);
        } catch (error) {
            throw new MakeException(error.message);
        }
    }

    /**
     * Throw exception if file already exists
     */
    public throwExceptionIfFileAlreadyExists(filePath: string): void {
        if (fs.existsSync(filePath)) {
            console.log(colors.red(`File already exists ${filePath}`));
            process.exit(0);
        }
    }
}
