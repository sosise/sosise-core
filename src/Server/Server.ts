import colors from 'colors';
import Compression from 'compression';
import { RedisStore } from 'connect-redis';
import Express from 'express';
import { NextFunction, Request, Response } from 'express';
import ExpressSession from 'express-session';
import fs from 'fs';
import SessionMemoryStore from 'memorystore';
import { createServer, Server as HttpServer } from 'node:http';
import { createClient } from 'redis';
import SessionFileStore from 'session-file-store';
import SessionInitializationException from '../Exceptions/Session/SessionInitializationException';
import stopHttpServer from './HttpServerShutdown';
import applyHttpServerTimeouts from './HttpServerTimeouts';
import resolveHttpTransportOptions, { HttpTransportOptions } from './HttpTransportOptions';
import ServerInformation from './ServerInformation';

export default class Server {
    private transportOptions?: HttpTransportOptions;
    private httpServer?: HttpServer;
    private startPromise?: Promise<HttpServer>;
    private stopPromise?: Promise<void>;
    private sessionStoreCleanup?: () => void | Promise<void>;

    /**
     * Run server
     */
    public async run(): Promise<void> {
        await this.start();
    }

    /**
     * Start server and resolve once it accepts connections
     */
    public async start(): Promise<HttpServer> {
        // Let a shutdown in progress finish so a restart never races with it
        if (this.stopPromise) {
            await this.stopPromise;
        }

        // Nothing to do when the server is already listening
        if (this.httpServer) {
            return this.httpServer;
        }

        // Serialize concurrent callers onto a single startup attempt
        if (!this.startPromise) {
            this.startPromise = this.startHttpServer();
        }

        try {
            return await this.startPromise;
        } finally {
            this.startPromise = undefined;
        }
    }

    /**
     * Perform the startup attempt, releasing acquired resources when it fails
     */
    private async startHttpServer(): Promise<HttpServer> {
        try {
            return await this.initializeHttpServer();
        } catch (error) {
            // A half-initialized session store would otherwise keep the process alive
            await this.cleanupSessionStore();
            throw error;
        }
    }

    /**
     * Build the Express application and put its HTTP server on the wire
     */
    private async initializeHttpServer(): Promise<HttpServer> {
        // Print server information
        const serverInformation = new ServerInformation();
        await serverInformation.printServerInformation();

        // Resolve transport behaviour before anything is registered on the application
        const transportOptions = resolveHttpTransportOptions();
        this.transportOptions = transportOptions;

        // Instantiate app
        const app = Express();

        // Use gzip compression in responses
        if (transportOptions.compression) {
            app.use(Compression());
        }

        // Port
        const port = process.env.LISTEN_PORT || process.env.PORT || 10000;

        // Session support
        await this.registerSession(app);

        // Setting up request body parsers
        this.registerBodyParsers(app, transportOptions);

        // Dynamic middlewares registration
        this.registerMiddlewares(app);

        // Setting up routes
        const apiRoutes = require(process.cwd() + '/build/routes/api').default;
        app.use('/', apiRoutes);

        // Exception handler
        const Handler = require(process.cwd() + '/build/app/Exceptions/Handler').default;
        app.use((error: any, request: Request, response: Response, next: NextFunction) => {
            new Handler().reportHttpException(request, response, error);
        });

        // Create and configure the HTTP server before accepting connections
        const httpServer = createServer(app);
        applyHttpServerTimeouts(httpServer);

        // Start the server
        await this.listen(httpServer, Number(port));

        this.httpServer = httpServer;
        return httpServer;
    }

    /**
     * Register the session middleware when the application ships a session config
     */
    private async registerSession(app: Express.Application): Promise<void> {
        // Check if session config exists
        if (!fs.existsSync(process.cwd() + '/build/config/session.js')) {
            return;
        }

        // Require session config
        const sessionConfig = require(process.cwd() + '/build/config/session').default;

        // Only if sessions are enabled in the config
        if (!sessionConfig.enabled) {
            return;
        }

        // Trust first proxy
        app.set('trust proxy', 1);

        // Initialize session store
        switch (sessionConfig.driver) {
            case 'file': {
                const FileStore = SessionFileStore(ExpressSession);
                const fileStoreOptions = sessionConfig.drivers[sessionConfig.driver];
                sessionConfig.store = new FileStore(fileStoreOptions);

                // The store publishes its reap timer back onto the options object it was given
                this.sessionStoreCleanup = () => {
                    if (fileStoreOptions.reapIntervalObject) {
                        clearInterval(fileStoreOptions.reapIntervalObject);
                        fileStoreOptions.reapIntervalObject = undefined;
                    }
                };
                break;
            }

            case 'memory': {
                const MemoryStore = SessionMemoryStore(ExpressSession);
                const memoryStore = new MemoryStore(sessionConfig.drivers[sessionConfig.driver]);
                sessionConfig.store = memoryStore;
                this.sessionStoreCleanup = () => memoryStore.stopInterval();
                break;
            }

            case 'redis': {
                // Create Redis client for session store
                const redisSessionConfig = sessionConfig.drivers[sessionConfig.driver];
                const redisClient = createClient({
                    url: `redis://${redisSessionConfig.host}:${redisSessionConfig.port}`,
                });
                await redisClient.connect();
                this.sessionStoreCleanup = async () => {
                    if (redisClient.isOpen) {
                        await redisClient.quit();
                    }
                };

                // Initialize Redis session store
                sessionConfig.store = new RedisStore({
                    client: redisClient,
                    prefix: redisSessionConfig.prefix,
                    ttl: redisSessionConfig.ttl,
                });
                break;
            }

            default:
                throw new SessionInitializationException(
                    'Session driver is not supported, let me know which driver you need, I will add it',
                );
        }

        app.use(ExpressSession(sessionConfig));
    }

    /**
     * Register the global request body parsers
     *
     * Each parser consumes the request stream, so an application that needs untouched
     * request bodies (streamed uploads, request proxying) can switch them off and
     * register the parsers it needs on individual routes instead.
     */
    private registerBodyParsers(app: Express.Application, transportOptions: HttpTransportOptions): void {
        // Setting up POST params parser
        if (transportOptions.jsonParser) {
            app.use(
                Express.json({
                    limit: transportOptions.jsonBodyLimit,
                }),
            );
        }

        if (transportOptions.urlencodedParser) {
            app.use(
                Express.urlencoded({
                    extended: true,
                    limit: transportOptions.jsonBodyLimit,
                }),
            );
        }

        // Setting up multipart/form-data
        if (transportOptions.rawParser) {
            app.use(
                Express.raw({
                    limit: transportOptions.rawBodyLimit,
                    // type: '*/*'
                }),
            );
        }
    }

    /**
     * Register every middleware listed in the application middleware kernel
     */
    private registerMiddlewares(app: Express.Application): void {
        const registeredMiddlewares = require(process.cwd() + '/build/app/Http/Middlewares/Kernel').middlewares;
        const middlewareSearchPaths = [
            process.cwd() + '/build/app/Http/Middlewares/',
            process.cwd() + '/node_modules/sosise-core/build/Middlewares/',
        ];

        // Register each middleware from Kernel configuration
        for (const middlewareName of registeredMiddlewares) {
            // Check each potential location where middleware might be stored
            for (const middlewareDirectory of middlewareSearchPaths) {
                const middlewareFilePath = middlewareDirectory + middlewareName + '.js';

                // Register middleware if file exists at current path
                if (fs.existsSync(middlewareFilePath)) {
                    const MiddlewareModule = require(middlewareFilePath);
                    const middlewareHandler = new MiddlewareModule.default();
                    app.use(middlewareHandler.handle.bind(middlewareHandler));
                    break; // Stop searching other paths once found
                }
            }
        }
    }

    /**
     * Bind the HTTP server to its port, rejecting when the port cannot be acquired
     */
    private async listen(httpServer: HttpServer, port: number): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            const handleListenError = (error: Error) => reject(error);

            httpServer.once('error', handleListenError);
            httpServer.listen(port, () => {
                httpServer.off('error', handleListenError);
                console.log(colors.white('Listening at ') + colors.blue(`http://0.0.0.0:${port}`));
                resolve();
            });
        });
    }

    /**
     * Stop accepting connections and release every resource the server owns
     */
    public async stop(): Promise<void> {
        // Join an already running shutdown instead of starting a second one
        if (this.stopPromise) {
            await this.stopPromise;
            return;
        }

        this.stopPromise = this.shutdownHttpServer();

        try {
            await this.stopPromise;
        } finally {
            this.stopPromise = undefined;
        }
    }

    /**
     * Perform the shutdown sequence
     */
    private async shutdownHttpServer(): Promise<void> {
        // Let a startup in progress settle before tearing anything down
        if (this.startPromise) {
            try {
                await this.startPromise;
            } catch {
                // A failed startup has already released its own resources
                return;
            }
        }

        const httpServer = this.httpServer;
        this.httpServer = undefined;

        try {
            // Both are set together by a successful startup
            if (httpServer && this.transportOptions) {
                await stopHttpServer(httpServer, this.transportOptions.shutdownTimeout);
            }
        } finally {
            await this.cleanupSessionStore();
        }
    }

    /**
     * Release the session store resources owned by this server
     */
    private async cleanupSessionStore(): Promise<void> {
        const sessionStoreCleanup = this.sessionStoreCleanup;

        if (sessionStoreCleanup) {
            await sessionStoreCleanup();

            // Only drop the reference when a restart has not installed a new one meanwhile
            if (this.sessionStoreCleanup === sessionStoreCleanup) {
                this.sessionStoreCleanup = undefined;
            }
        }
    }
}
