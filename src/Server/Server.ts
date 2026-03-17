import colors from 'colors';
import Compression from 'compression';
import { RedisStore } from 'connect-redis';
import Express from 'express';
import { NextFunction, Request, Response } from 'express';
import ExpressSession from 'express-session';
import fs from 'fs';
import SessionMemoryStore from 'memorystore';
import { createClient } from 'redis';
import SessionFileStore from 'session-file-store';
import SessionInitializationException from '../Exceptions/Session/SessionInitializationException';
import ServerInformation from './ServerInformation';

export default class Server {
    /**
     * Run server
     */
    public async run(): Promise<void> {
        // Print server information
        const serverInformation = new ServerInformation();
        await serverInformation.printServerInformation();

        // Instantiate app
        const app = Express();

        // Use gzip compression in responses
        app.use(Compression());

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
                        sessionConfig.store = new FileStore(sessionConfig.drivers[sessionConfig.driver]);
                        break;

                    case 'memory':
                        const MemoryStore = SessionMemoryStore(ExpressSession);
                        sessionConfig.store = new MemoryStore(sessionConfig.drivers[sessionConfig.driver]);
                        break;

                    case 'redis':
                        // Create Redis client for session store
                        const redisSessionConfig = sessionConfig.drivers[sessionConfig.driver];
                        const redisClient = createClient({
                            url: `redis://${redisSessionConfig.host}:${redisSessionConfig.port}`,
                        });
                        await redisClient.connect();

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

        // Setting up POST params parser
        app.use(Express.json());
        app.use(
            Express.urlencoded({
                extended: true,
            }),
        );

        // Setting up multipart/form-data

        app.use(
            Express.raw({
                limit: '150mb',
                // type: '*/*'
            }),
        );

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

        // Start the server
        // app.listen(port, () => console.log(`Listening at http://localhost:${port}`));
        app.listen(port, () => console.log(colors.white('Listening at ') + colors.blue(`http://0.0.0.0:${port}`)));
    }
}
