import colors from 'colors';
import fs from 'fs';
import MakeException from '../../Exceptions/Artisan/MakeException';
import Base from './Base';

export default class Config extends Base {
    protected templatePath = __dirname + '/../FileTemplates/ConfigTemplate.txt';
    protected createPath = 'src/config';

    /**
     * Create file
     */
    public createFile(): void {
        try {
            let templateFileContent = fs.readFileSync(this.templatePath, 'utf8');
            templateFileContent = templateFileContent.replace(
                new RegExp('%name%', 'g'),
                this.name.toLocaleLowerCase() + 'Config',
            );
            const pathOfNewFile = `${process.cwd()}/${this.createPath}/${this.name}.ts`;
            this.throwExceptionIfFileAlreadyExists(pathOfNewFile);
            fs.writeFileSync(pathOfNewFile, templateFileContent);
            console.log(colors.green(`Created ${this.constructor.name}:`), `${this.createPath}/${this.name}.ts`);
        } catch (error) {
            throw new MakeException(error.message);
        }
    }
}
