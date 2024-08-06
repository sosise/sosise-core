import Base from "./Base";

export default class QueueWorker extends Base {
    protected templatePath = __dirname + '/../FileTemplates/QueueWorkerTemplate.txt';
    protected createPath = 'src/app/Console/QueueWorkers';
}
