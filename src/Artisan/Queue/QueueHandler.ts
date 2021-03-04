import { QueueGetters } from 'bullmq';
import fs from 'fs';
import colors from 'colors';
import { inspect } from 'util';

export default class QueueHandler {

    protected workersPath = '/build/app/Console/QueueWorkers';

    /**
     * Iterate through queue workers and try to listen
     */
    public async listen(queueName: string): Promise<void> {
        // Get list of worker files
        let listOfWorkerFiles = fs.readdirSync(process.cwd() + this.workersPath);

        // Filter out only js files
        listOfWorkerFiles = listOfWorkerFiles.filter((element) => {
            return (element.includes('js') && !element.includes('map'));
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
                console.log(`Start listening queue: "${queueName}"`.green);

                // Execute method listen of the worker
                await instance.listen();

                // Do not proceed
                return;
            }
        }

        // Log, if we've reached this line, means that no worker found for given queue name
        console.log(`Sorry there is no worker with specified queue name ${queueName}, take a look at src/app/Console/QueueWorkers`.yellow);
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
        console.log(`Sent ${jobs.length} failed jobs back to waiting queue`.green);
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
        console.log(`Flushed (removed) ${jobs.length} failed jobs`.green);
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
        console.log(`Failed Jobs (${jobs.length})`.red);
        console.log('---------'.red);
        for (const job of jobs) {
            const jobId = job.id;
            const jobPayload = inspect(job.data, {
                depth: null,
                maxArrayLength: null,
                colors: false
            });
            console.log(`Job id: ${jobId} Job payload: ${jobPayload}`.red);
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
        console.log(`Waiting Jobs (${jobs.length})`.yellow);
        console.log('---------'.yellow);
        for (const job of jobs) {
            const jobId = job.id;
            const jobPayload = inspect(job.data, {
                depth: null,
                maxArrayLength: null,
                colors: false
            });
            console.log(`Job id: ${jobId} Job payload: ${jobPayload}`.yellow);
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
        console.log(`Delayed Jobs (${jobs.length})`.blue);
        console.log('---------'.blue);
        for (const job of jobs) {
            const jobId = job.id;
            const jobPayload = inspect(job.data, {
                depth: null,
                maxArrayLength: null,
                colors: false
            });
            console.log(`Job id: ${jobId} Job payload: ${jobPayload}`.blue);
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
        console.log(`Completed Jobs (${jobs.length})`.gray);
        console.log('---------'.gray);
        for (const job of jobs) {
            const jobId = job.id;
            const jobPayload = inspect(job.data, {
                depth: null,
                maxArrayLength: null,
                colors: false
            });
            console.log(`Job id: ${jobId} Job payload: ${jobPayload}`.gray);
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
        console.log(`Active Jobs (${jobs.length})`.green);
        console.log('---------'.green);
        for (const job of jobs) {
            const jobId = job.id;
            const jobPayload = inspect(job.data, {
                depth: null,
                maxArrayLength: null,
                colors: false
            });
            console.log(`Job id: ${jobId} Job payload: ${jobPayload}`.green);
        }
        console.log('');
    }
}
