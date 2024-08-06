import Base from "./Base";

export default class Enum extends Base {
    protected templatePath = __dirname + '/../FileTemplates/EnumTemplate.txt';
    protected createPath = 'src/app/Enums';
}
