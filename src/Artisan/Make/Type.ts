import Base from './Base';

export default class Type extends Base {
    protected templatePath = __dirname + '/../FileTemplates/UnifierTemplate.txt';
    protected createPath = 'src/app/Types';
}
