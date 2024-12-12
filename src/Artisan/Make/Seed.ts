import colors from 'colors';
import dayjs from 'dayjs';
import fs from 'fs';
import MakeException from '../../Exceptions/Artisan/MakeException';
import Base from './Base';

export default class Seed extends Base {
    protected templatePath = __dirname + '/../FileTemplates/SeedTemplate.txt';
    protected createPath = 'src/database/seeds';

    /**
     * Create file
     */
    public createFile(): void {
        try {
            let templateFileContent = fs.readFileSync(this.templatePath, 'utf8');
            const convertedSeedNameToClassName = this.name
                .split('_')
                .map((element) => {
                    return element.charAt(0).toUpperCase() + element.slice(1);
                })
                .join('');
            templateFileContent = templateFileContent.replace('%name%', convertedSeedNameToClassName);
            fs.writeFileSync(
                `${process.cwd()}/${this.createPath}/${dayjs().format('YYYY_MM_DD_HHmmss')}_${this.name}.ts`,
                templateFileContent,
            );
            console.log(
                colors.green('Created Seed:'),
                `${this.createPath}/${dayjs().format('YYYY_MM_DD_HHmmss')}_${this.name}.ts`,
            );
        } catch (error) {
            throw new MakeException(error.message);
        }
    }
}
