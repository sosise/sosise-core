import { QueueGetters } from "bullmq";
import colors from "colors";
import fs from "fs";
import { inspect } from "util";

export default class QueueHandler {

    protected workersPath = '/build/app/Console/QueueWorkers';

    /**
     * Iterate through queue workers and try to listen
     */
    public async listen(queueName: string): Promise<void> {
        // Proceed only when migrations path exists
        if (!fs.existsSync(process.cwd() + this.workersPath)) {
            console.log(colors.yellow(`Ups, you don't have any workers, you can create them with ./artisan make:queueworker MyWorker`));
            return;
        }

        // Get list of worker files
        let listOfWorkerFiles = fs.readdirSync(process.cwd() + this.workersPath);

        // Filter out only js files
        listOfWorkerFiles = listOfWorkerFiles.filter((element) => {
            if (element.match(/js$/) && !element.match(/map$/)) {
                return true;
            }
        });

        // Now iterate through each worker file and search one we need
        for (const workerFile of listOfWorkerFiles) {
            // Cut the file extension from file name
            const workerName = workerFile.split('.')[0];

            // Get worker file path
            const workerFilePath = `${process.cwd()}${this.workersPath}/${workerName}.js`;

            // Import worker file
            const workerFileClass = await import(workerFilePath);

            // Instantiate migration class
            const instance = new workerFileClass.default();

            // Now check if queueName is that one which we should listen to
            if (instance.queueName === queueName) {
                // Log
                console.log(colors.green(`Start listening queue: "${queueName}"`));

                // Execute method listen of the worker
                await instance.listen();

                // Do not proceed
                return;
            }
        }

        // Log, if we've reached this line, means that no worker found for given queue name
        console.log(colors.yellow(`Sorry there is no worker with specified queue name ${queueName}, take a look at src/app/Console/QueueWorkers`));
    }

    /**
     * Retry failed jobs by queue name
     */
    public async retryFailedByQueueName(queueName: string): Promise<void> {
        // Get queue config
        const queueConfig = require(process.cwd() + '/build/config/queue').default;

        // Instantiate queue getter
        const queueGetters = new QueueGetters(queueName, { connection: { host: queueConfig.redis.host, port: queueConfig.redis.port } });

        // Get all failed jobs
        const jobs = await queueGetters.getFailed(0, await queueGetters.getFailedCount());

        // Retry all failed jobs in parallel
        const promiseList: any[] = [];
        for (const job of jobs) {
            promiseList.push(job.retry());
        }
        await Promise.all(promiseList);

        // Log
        console.log(colors.green(`Sent ${jobs.length} failed jobs back to waiting queue`));
    }

    /**
     * Retry delayed jobs by queue name
     */
    public async retryDelayedByQueueName(queueName: string): Promise<void> {
        // Get queue config
        const queueConfig = require(process.cwd() + '/build/config/queue').default;

        // Instantiate queue getter
        const queueGetters = new QueueGetters(queueName, { connection: { host: queueConfig.redis.host, port: queueConfig.redis.port } });

        // Get all delayed jobs
        const jobs = await queueGetters.getDelayed(0, await queueGetters.getDelayedCount());

        // Retry all delayed jobs in parallel
        const promiseList: any[] = [];
        for (const job of jobs) {
            promiseList.push(job.changeDelay(0));
        }
        await Promise.all(promiseList);

        // Log
        console.log(colors.green(`Sent ${jobs.length} delayed jobs back to waiting queue`));
    }

    /**
     * Flush all jobs marked as failed
     */
    public async flushFailed(queueName: string): Promise<void> {
        // Get queue config
        const queueConfig = require(process.cwd() + '/build/config/queue').default;

        // Instantiate queue getter
        const queueGetters = new QueueGetters(queueName, { connection: { host: queueConfig.redis.host, port: queueConfig.redis.port } });

        // Get jobs
        const jobs = await queueGetters.getFailed(0, await queueGetters.getFailedCount());

        // Remove (flush) all failed jobs in parallel
        const promiseList: any[] = [];
        for (const job of jobs) {
            promiseList.push(job.remove());
        }
        await Promise.all(promiseList);

        // Log
        console.log(colors.green(`Flushed (removed) ${jobs.length} failed jobs`));
    }

    /**
     * List failed jobs
     */
    public async listFailedJobs(queueName: string): Promise<void> {
        // Get queue config
        const queueConfig = require(process.cwd() + '/build/config/queue').default;

        // Instantiate queue getter
        const queueGetters = new QueueGetters(queueName, { connection: { host: queueConfig.redis.host, port: queueConfig.redis.port } });

        // Get jobs
        const jobs = await queueGetters.getFailed(0, await queueGetters.getFailedCount());

        // Log
        console.log(colors.red(`Failed Jobs (${jobs.length})`));
        console.log(colors.red('---------'));
        for (const job of jobs) {
            const jobId = job.id;
            const jobPayload = inspect(job.data, {
                depth: null,
                maxArrayLength: null,
                colors: false
            });
            console.log(colors.red(`Job id: ${jobId} payload: ${jobPayload}`));
        }
        console.log('');
    }

    /**
     * List waiting jobs
     */
    public async listWaitingJobs(queueName: string): Promise<void> {
        // Get queue config
        const queueConfig = require(process.cwd() + '/build/config/queue').default;

        // Instantiate queue getter
        const queueGetters = new QueueGetters(queueName, { connection: { host: queueConfig.redis.host, port: queueConfig.redis.port } });

        // Get jobs
        const jobs = await queueGetters.getWaiting(0, await queueGetters.getWaitingCount());

        // Log
        console.log(colors.yellow(`Waiting Jobs (${jobs.length})`));
        console.log(colors.yellow('---------'));
        for (const job of jobs) {
            const jobId = job.id;
            const jobPayload = inspect(job.data, {
                depth: null,
                maxArrayLength: null,
                colors: false
            });
            console.log(colors.yellow(`Job id: ${jobId} payload: ${jobPayload}`));
        }
        console.log('');
    }

    /**
     * List delayed jobs
     */
    public async listDelayedJobs(queueName: string): Promise<void> {
        // Get queue config
        const queueConfig = require(process.cwd() + '/build/config/queue').default;

        // Instantiate queue getter
        const queueGetters = new QueueGetters(queueName, { connection: { host: queueConfig.redis.host, port: queueConfig.redis.port } });

        // Get jobs
        const jobs = await queueGetters.getDelayed(0, await queueGetters.getDelayedCount());

        // Log
        console.log(colors.blue(`Delayed Jobs (${jobs.length})`));
        console.log(colors.blue('---------'));
        for (const job of jobs) {
            const jobId = job.id;
            const jobPayload = inspect(job.data, {
                depth: null,
                maxArrayLength: null,
                colors: false
            });
            console.log(colors.blue(`Job id: ${jobId} payload: ${jobPayload}`));
        }
        console.log('');
    }

    /**
     * List completed jobs
     */
    public async listCompletedJobs(queueName: string): Promise<void> {
        // Get queue config
        const queueConfig = require(process.cwd() + '/build/config/queue').default;

        // Instantiate queue getter
        const queueGetters = new QueueGetters(queueName, { connection: { host: queueConfig.redis.host, port: queueConfig.redis.port } });

        // Get jobs
        const jobs = await queueGetters.getCompleted(0, await queueGetters.getCompletedCount());

        // Log
        console.log(colors.gray(`Completed Jobs (${jobs.length})`));
        console.log(colors.gray('---------'));
        for (const job of jobs) {
            const jobId = job.id;
            const jobPayload = inspect(job.data, {
                depth: null,
                maxArrayLength: null,
                colors: false
            });
            console.log(colors.gray(`Job id: ${jobId} payload: ${jobPayload}`));
        }
        console.log('');
    }

    /**
     * List active jobs
     */
    public async listActiveJobs(queueName: string): Promise<void> {
        // Get queue config
        const queueConfig = require(process.cwd() + '/build/config/queue').default;

        // Instantiate queue getter
        const queueGetters = new QueueGetters(queueName, { connection: { host: queueConfig.redis.host, port: queueConfig.redis.port } });

        // Get jobs
        const jobs = await queueGetters.getActive(0, await queueGetters.getActiveCount());

        // Log
        console.log(colors.green(`Active Jobs (${jobs.length})`));
        console.log(colors.green('---------'));
        for (const job of jobs) {
            const jobId = job.id;
            const jobPayload = inspect(job.data, {
                depth: null,
                maxArrayLength: null,
                colors: false
            });
            console.log(colors.green(`Job id: ${jobId} payload: ${jobPayload}`));
        }
        console.log('');
    }
}
