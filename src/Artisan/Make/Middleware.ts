import Base from './Base';
import fs from 'fs';
import colors from 'colors';
import MakeException from '../../Exceptions/Artisan/MakeException';

export default class Middleware extends Base {
    protected templatePath = __dirname + '/../FileTemplates/MiddlewareTemplate.txt';
    protected createPath = 'src/app/Http/Middlewares';

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
            console.log(colors.green('Created Middleware:'), `${this.createPath}/${this.name}.ts`);
            console.log(colors.yellow(`Dont't forget to register the middleware in src/app/Http/Middlewares/Kernel.ts`));
        } catch (error) {
            throw new MakeException(error.message);
        }
    }
}
