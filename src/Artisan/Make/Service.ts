import Base from './Base';

export default class Service extends Base {
    protected templatePath = __dirname + '/../FileTemplates/ServiceTemplate.txt';
    protected createPath = 'src/app/Services';
}
