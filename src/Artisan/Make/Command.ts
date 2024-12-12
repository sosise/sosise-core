import Base from './Base';

export default class Command extends Base {
    protected templatePath = __dirname + '/../FileTemplates/CommandTemplate.txt';
    protected createPath = 'src/app/Console/Commands';
}
