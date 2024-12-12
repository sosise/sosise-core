import colors from 'colors';
import fs from 'fs';
import path from 'path';
import MakeException from '../../Exceptions/Artisan/MakeException';
import Base from './Base';

export default class Exception extends Base {
    protected templatePath = __dirname + '/../FileTemplates/ExceptionTemplate.txt';
    protected createPath = 'src/app/Exceptions';
    protected alreadyCreatedExceptionsPath = '/src/app/Exceptions';
    private defaultExceptionCode = 3000;

    /**
     * Create file
     */
    public createFile(): void {
        try {
            // Read template file content
            let templateFileContent = fs.readFileSync(this.templatePath, 'utf8');

            // Replace in template content the class name
            templateFileContent = templateFileContent.replace(
                new RegExp('%name%', 'g'),
                this.name.charAt(0).toUpperCase() + this.name.slice(1),
            );

            // Prepare path of the new file
            const pathOfNewFile = `${process.cwd()}/${this.createPath}/${this.name}.ts`;

            // Throw exception if file already exists
            this.throwExceptionIfFileAlreadyExists(pathOfNewFile);

            // After we are sure that the file we want to create does not exists, get all exception files and parse them
            // To determine which code should be the next
            // Get list of migration files
            let listOfExceptionFiles = this.getAllFilesRecursive(process.cwd() + this.alreadyCreatedExceptionsPath);

            // Filter out only js files
            listOfExceptionFiles = listOfExceptionFiles.filter((element) => {
                if (element.match(/ts$/) && !element.match(/Handler.ts$/)) {
                    return true;
                }
            });

            // Iterate through all exception files and parse them to determine the biggest code
            // Now iterate through each migration file and try to migrate it
            let biggestExceptionCode: number = 0;
            for (const exceptionFile of listOfExceptionFiles) {
                // Read the exception file content
                const exceptionFileContent = fs.readFileSync(exceptionFile, 'utf-8');

                // Parse the code
                const codeInExceptionFile = exceptionFileContent.match(/code = ([0-9]{1,});/);

                if (
                    codeInExceptionFile &&
                    codeInExceptionFile[1] &&
                    biggestExceptionCode < Number(codeInExceptionFile[1])
                ) {
                    biggestExceptionCode = Number(codeInExceptionFile[1]);
                }
            }

            // If we could't determine biggest exception code just use the default
            if (biggestExceptionCode === 0) {
                // Replace in template content the code
                templateFileContent = templateFileContent.replace(
                    new RegExp('%code%', 'g'),
                    this.defaultExceptionCode.toString(),
                );
            } else {
                // Increment biggest exception code
                biggestExceptionCode++;

                // Replace in template content the code
                templateFileContent = templateFileContent.replace(
                    new RegExp('%code%', 'g'),
                    biggestExceptionCode.toString(),
                );
            }

            // Write new file
            fs.writeFileSync(pathOfNewFile, templateFileContent);

            // Console log
            console.log(colors.green(`Created ${this.constructor.name}:`), `${this.createPath}/${this.name}.ts`);
        } catch (error) {
            throw new MakeException(error.message);
        }
    }

    /**
     * Get all files recursive
     */
    private getAllFilesRecursive(dir: string) {
        const allFiles = fs.readdirSync(dir, { withFileTypes: true });
        const files: any[] = [];
        for (const file of allFiles) {
            const res = path.resolve(dir, file.name);
            files.push(file.isDirectory() ? this.getAllFilesRecursive(res) : res);
        }
        return files.flat();
    }
}
