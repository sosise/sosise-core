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
import applyHttpServerTimeouts from './HttpServerTimeouts';
import ServerInformation from './ServerInformation';

export interface ServerOptions {
    /** Enable framework-wide response compression. Defaults to true. */
    compression?: boolean;

    /** Enable framework-wide JSON, URL-encoded and raw request parsers. Defaults to true. */
    globalBodyParsers?: boolean;
}

export default class Server {
    private httpServer?: HttpServer;
    private startPromise?: Promise<HttpServer>;
    private stopPromise?: Promise<void>;
    private sessionStoreCleanup?: () => void | Promise<void>;

    public constructor(private readonly options: ServerOptions = {}) {}

    /**
     * Run server
     */
    public async run(): Promise<void> {
        await this.start();
    }

    /**
     * Start server and return its HTTP handle
     */
    public async start(): Promise<HttpServer> {
        if (this.stopPromise) {
            await this.stopPromise;
        }

        if (this.httpServer) {
            return this.httpServer;
        }

        if (!this.startPromise) {
            this.startPromise = this.startHttpServer();
        }

        try {
            return await this.startPromise;
        } finally {
            this.startPromise = undefined;
        }
    }

    private async startHttpServer(): Promise<HttpServer> {
        try {
            return await this.initializeHttpServer();
        } catch (error) {
            await this.cleanupSessionStore();
            throw error;
        }
    }

    private async initializeHttpServer(): Promise<HttpServer> {
        // Print server information
        const serverInformation = new ServerInformation();
        await serverInformation.printServerInformation();

        // Instantiate app
        const app = Express();

        // Use gzip compression in responses
        if (this.options.compression !== false) {
            app.use(Compression());
        }

        // Port
        const port = process.env.LISTEN_PORT || process.env.PORT || 10000;

        // Session support
        // Check if session config exists
        if (fs.existsSync(process.cwd() + '/build/config/session.js')) {
            // Require session config
            const sessionConfig = require(process.cwd() + '/build/config/session').default;

            // Only if sessions are enabled in the config
            if (sessionConfig.enabled) {
                // Trust first proxy
                app.set('trust proxy', 1);

                // Initialize session store
                switch (sessionConfig.driver) {
                    case 'file':
                        const FileStore = SessionFileStore(ExpressSession);
                        const fileStoreOptions = sessionConfig.drivers[sessionConfig.driver];
                        sessionConfig.store = new FileStore(fileStoreOptions);
                        this.sessionStoreCleanup = () => {
                            if (fileStoreOptions.reapIntervalObject) {
                                clearInterval(fileStoreOptions.reapIntervalObject);
                                fileStoreOptions.reapIntervalObject = undefined;
                            }
                        };
                        break;

                    case 'memory':
                        const MemoryStore = SessionMemoryStore(ExpressSession);
                        const memoryStore = new MemoryStore(sessionConfig.drivers[sessionConfig.driver]);
                        sessionConfig.store = memoryStore;
                        this.sessionStoreCleanup = () => memoryStore.stopInterval();
                        break;

                    case 'redis':
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

                    default:
                        throw new SessionInitializationException(
                            'Session driver is not supported, let me know which driver you need, I will add it',
                        );
                }
                app.use(ExpressSession(sessionConfig));
            }
        }

        if (this.options.globalBodyParsers !== false) {
            // Setting up POST params parser
            app.use(
                Express.json({
                    limit: process.env.HTTP_JSON_BODY_LIMIT || '10mb',
                }),
            );
            app.use(
                Express.urlencoded({
                    extended: true,
                    limit: process.env.HTTP_JSON_BODY_LIMIT || '10mb',
                }),
            );

            // Setting up multipart/form-data
            app.use(
                Express.raw({
                    limit: '150mb',
                    // type: '*/*'
                }),
            );
        }

        // Dynamic middlewares registration
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
        await new Promise<void>((resolve, reject) => {
            const handleError = (error: Error) => reject(error);
            httpServer.once('error', handleError);
            httpServer.listen(Number(port), () => {
                httpServer.off('error', handleError);
                console.log(colors.white('Listening at ') + colors.blue(`http://0.0.0.0:${port}`));
                resolve();
            });
        });

        this.httpServer = httpServer;
        return httpServer;
    }

    /**
     * Stop accepting connections and close server-owned resources
     */
    public async stop(): Promise<void> {
        if (this.stopPromise) {
            await this.stopPromise;
            return;
        }

        const stopPromise = this.stopHttpServer();
        this.stopPromise = stopPromise;

        try {
            await stopPromise;
        } finally {
            this.stopPromise = undefined;
        }
    }

    private async stopHttpServer(): Promise<void> {
        if (this.startPromise) {
            try {
                await this.startPromise;
            } catch {
                return;
            }
        }

        const httpServer = this.httpServer;
        this.httpServer = undefined;

        try {
            if (httpServer) {
                await new Promise<void>((resolve, reject) => {
                    httpServer.close((error?: Error) => (error ? reject(error) : resolve()));
                });
            }
        } finally {
            await this.cleanupSessionStore();
        }
    }

    private async cleanupSessionStore(): Promise<void> {
        const sessionStoreCleanup = this.sessionStoreCleanup;

        if (sessionStoreCleanup) {
            await sessionStoreCleanup();
            if (this.sessionStoreCleanup === sessionStoreCleanup) {
                this.sessionStoreCleanup = undefined;
            }
        }
    }
}
