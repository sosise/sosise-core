import BodyParser from 'body-parser';
import colors from 'colors';
import Compression from 'compression';
import SessionRedisStore from 'connect-redis';
import Express from 'express';
import { NextFunction, Request, Response } from 'express';
import ExpressSession from 'express-session';
import fs from 'fs';
import SessionMemoryStore from 'memorystore';
import Redis from 'redis';
import SessionFileStore from 'session-file-store';
import * as Sentry from '@sentry/node';
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
                        const RedisStore = SessionRedisStore(ExpressSession);
                        sessionConfig.store = new RedisStore({
                            client: Redis.createClient(),
                            ...sessionConfig.drivers[sessionConfig.driver],
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

        // Initialize sentry
        const sentryConfig = require(process.cwd() + '/build/config/sentry').default;
        Sentry.init(sentryConfig);

        // Setting up POST params parser
        app.use(Express.json());
        app.use(
            Express.urlencoded({
                extended: true,
            }),
        );

        // Setting up multipart/form-data

        app.use(
            BodyParser.raw({
                limit: '150mb',
                // type: '*/*'
            }),
        );

        // app.use(ExpressFormData.parse({
        //     uploadDir: os.tmpdir(),
        //     autoClean: true
        // }));
        // app.use(ExpressFormData.format());
        // app.use(ExpressFormData.stream());
        // app.use(ExpressFormData.union());

        // RequestHandler creates a separate execution context using domains, so that every
        // transaction/span/breadcrumb is attached to its own Hub instance
        // app.use(Sentry.Handlers.requestHandler());

        // TracingHandler creates a trace for every incoming request
        // app.use(Sentry.Handlers.tracingHandler());

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

        // The error handler must be before any other error middleware and after all controllers
        app.use(
            Sentry.Handlers.errorHandler({
                shouldHandleError(error) {
                    // Send exception to sentry when property sendToSentry exists and is true
                    // @ts-ignore
                    if (error.sendToSentry !== undefined && error.sendToSentry === true) {
                        return true;
                    }

                    // Do not send exception to sentry when property sendToSentry exists and is false
                    // @ts-ignore
                    if (error.sendToSentry !== undefined && error.sendToSentry === false) {
                        return false;
                    }

                    // When property was not found in the exception, send to sentry by default
                    return true;
                },
            }),
        );

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
