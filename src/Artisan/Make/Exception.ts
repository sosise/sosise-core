import Base from './Base';

export default class Exception extends Base {
    protected templatePath = __dirname + '/../FileTemplates/ExceptionTemplate.txt';
    protected createPath = 'src/app/Exceptions';
}
