import Base from "./Base";

export default class Controller extends Base {
    protected templatePath = __dirname + '/../FileTemplates/ControllerTemplate.txt';
    protected createPath = 'src/app/Http/Controllers';
}
