import { Job, JobsOptions, Queue as BullQueue } from 'bullmq';

export default class Queue {

    private static instances: { queueName: string, instance: Queue }[] = [];
    private queueClient: BullQueue;

    /**
     * Constructor
     */
    constructor(queueName: string) {
        // Get queue config
        const queueConfig = require(process.cwd() + '/build/config/queue').default;

        // Instantiate queue client
        this.queueClient = new BullQueue(queueName, {
            connection: {
                host: queueConfig.redis.host,
                port: queueConfig.redis.port
            }
        });
    }

    /**
     * Add job to the queue
     */
    public static async add(queueName: string, data: any, opts?: JobsOptions): Promise<Job<any, any, string>> {
        // Iterate through singleton instances and try to find already instantiated one
        for (const element of Queue.instances) {
            if (element.queueName === queueName && element.instance) {
                // Connection for the given queue name already instantiated, use it
                return element.instance.queueClient.add(queueName, data, opts);
            }
        }

        // At this step we are sure that we did not found given queue name and it's connection
        // Instantiate Queue
        const self = new Queue(queueName);
        Queue.instances.push({ queueName, instance: self });
        return self.queueClient.add(queueName, data, opts);
    }
}
