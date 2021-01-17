// After config, comes the application
import express from 'express';
import { Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import * as Sentry from '@sentry/node';
import * as Tracing from '@sentry/tracing';
import session from 'express-session';
import SessionFileStore from 'session-file-store';
import SessionMemoryStore from 'memorystore';
import SessionInitializationException from './Exceptions/Session/SessionInitializationException';
import fs from 'fs';

export default class Server {
    public run(): void {
        // Instantiate app
        const app = express();
        const port = process.env.LISTEN_PORT || 10000;

        // Session support
        // Only support session if session config exists
        if (fs.existsSync(process.cwd() + '/build/config/session.js')) {
            app.set('trust proxy', 1); // trust first proxy
            const sessionConfig = require(process.cwd() + '/build/config/session').default;

            // Initialize session store
            switch (sessionConfig.driver) {
                case 'file':
                    const FileStore = SessionFileStore(session);
                    sessionConfig.store = new FileStore(sessionConfig.drivers[sessionConfig.driver]);
                    break;

                case 'memory':
                    const MemoryStore = SessionMemoryStore(session);
                    sessionConfig.store = new MemoryStore(sessionConfig.drivers[sessionConfig.driver]);
                    break;

                default:
                    throw new SessionInitializationException('Session driver is not supported, let me know which driver you need, I will add it');
            }
            app.use(session(sessionConfig));
        }

        // Initialize sentry
        const sentryConfig = require(process.cwd() + '/build/config/sentry').default;
        Sentry.init({
            environment: process.env.APP_ENV,
            dsn: sentryConfig.dsn,
            integrations: [
                // enable HTTP calls tracing
                new Sentry.Integrations.Http({ tracing: true }),
                // enable Express.js middleware tracing
                new Tracing.Integrations.Express({ app }),
            ],
            tracesSampleRate: 1.0,
        });

        // Setting up POST params parser
        app.use(bodyParser.json()); // support json encoded bodies
        app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies

        // RequestHandler creates a separate execution context using domains, so that every
        // transaction/span/breadcrumb is attached to its own Hub instance
        app.use(Sentry.Handlers.requestHandler());
        // TracingHandler creates a trace for every incoming request
        app.use(Sentry.Handlers.tracingHandler());

        // Dynamic middlewares registration
        const middlewares = require(process.cwd() + '/build/app/Http/Middlewares/Kernel').middlewares;
        for (const middleware of middlewares) {
            const middlewarePath = process.cwd() + '/build/app/Http/Middlewares/' + middleware + '.js';
            // At this step use require, instead of import, because it's synchronous
            const middlewareClass = require(middlewarePath);
            const middlewareInstance = new middlewareClass.default();
            app.use(middlewareInstance.handle);
        }

        // Setting up routes
        const apiRoutes = require(process.cwd() + '/build/routes/api').default;
        app.use('/', apiRoutes);

        // The error handler must be before any other error middleware and after all controllers
        app.use(Sentry.Handlers.errorHandler());

        // Exception handler
        const Handler = require(process.cwd() + '/build/app/Exceptions/Handler').default;
        app.use((error: any, request: Request, response: Response, next: NextFunction) => {
            new Handler().reportHttpException(request, response, error);
        });

        // Start the server
        app.listen(port, () => console.log(`Listening at http://localhost:${port}`));
    }
}
