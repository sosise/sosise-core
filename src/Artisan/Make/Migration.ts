import colors from "colors";
import dayjs from "dayjs";
import fs from "fs";
import MakeException from "../../Exceptions/Artisan/MakeException";

export default class Migration {

    protected createTableMigrationTemplatePath = __dirname + '/../FileTemplates/MigrationCreateTemplate.txt';
    protected updateTableMigrationTemplatePath = __dirname + '/../FileTemplates/MigrationUpdateTemplate.txt';
    protected createPath = 'src/database/migrations';
    protected name: string;

    /**
     * Constructor
     */
    constructor(name: string) {
        this.name = name;
    }

    /**
     * Create migration file for table creation
     */
    public createMigrationForTableCreation(): void {
        try {
            let templateFileContent = fs.readFileSync(this.createTableMigrationTemplatePath, 'utf8');
            const convertedMigrationNameToClassName = this.name.split('_').map((element) => {
                return element.charAt(0).toUpperCase() + element.slice(1);
            }).join('');
            templateFileContent = templateFileContent.replace('%name%', convertedMigrationNameToClassName);
            fs.writeFileSync(`${process.cwd()}/${this.createPath}/${dayjs().format('YYYY_MM_DD_HHmmss')}_${this.name}.ts`, templateFileContent);
            console.log(colors.green('Created Migration:'), `${this.createPath}/${dayjs().format('YYYY_MM_DD_HHmmss')}_${this.name}.ts`);
        } catch (error) {
            throw new MakeException(error.message);
        }
    }

    /**
     * Create migration file for table updation
     */
    public createMigrationForTableUpdation(): void {
        try {
            let templateFileContent = fs.readFileSync(this.updateTableMigrationTemplatePath, 'utf8');
            const convertedMigrationNameToClassName = this.name.split('_').map((element) => {
                return element.charAt(0).toUpperCase() + element.slice(1);
            }).join('');
            templateFileContent = templateFileContent.replace('%name%', convertedMigrationNameToClassName);
            fs.writeFileSync(`${process.cwd()}/${this.createPath}/${dayjs().format('YYYY_MM_DD_HHmmss')}_${this.name}.ts`, templateFileContent);
            console.log(colors.green('Created Migration:'), `${this.createPath}/${dayjs().format('YYYY_MM_DD_HHmmss')}_${this.name}.ts`);
        } catch (error) {
            throw new MakeException(error.message);
        }
    }
}
