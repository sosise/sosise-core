import Base from './Base';

export default class Type extends Base {
    protected templatePath = __dirname + '/../FileTemplates/TypeTemplate.txt';
    protected createPath = 'src/app/Types';
}
