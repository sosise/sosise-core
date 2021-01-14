// After config, comes the application
import express from 'express';
import { Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import * as Sentry from '@sentry/node';
import * as Tracing from '@sentry/tracing';

export default class Server {
    public run(): void {
        // Instantiate app
        const app = express();
        const port = process.env.LISTEN_PORT || 10000;

        // Initialize sentry
        Sentry.init({
            dsn: process.env.SENTRY_DSN || undefined,
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
