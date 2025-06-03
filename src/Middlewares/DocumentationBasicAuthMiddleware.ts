import { NextFunction, Request, Response } from 'express';
const config = require(process.cwd() + '/build/config/documentation').default;

export default class DocumentationBasicAuthMiddleware {
    /**
     * This method handles the middleware
     */
    public async handle(request: Request, response: Response, next: NextFunction): Promise<any> {
        if (config.basicAuth.enabled === false) {
            next();
        } else {
            // Do not allow if basic auth user or password are not set in the .env
            if (!config.basicAuth.user || !config.basicAuth.pass) {
                response.status(500).send('Basic auth username or password not set, please contact administrator');
                return;
            }

            // If authorization header is not present, dont allow
            const authHeader = request.headers.authorization;
            if (!authHeader) {
                response.set('WWW-Authenticate', 'Basic').status(401).send('<h1>Unauthorized</h1>');
                return;
            }

            // Get username and password from request
            const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
            const user = auth[0];
            const pass = auth[1];

            // Check for username and password
            if (user === config.basicAuth.user && pass === config.basicAuth.pass) {
                next();
            } else {
                response.set('WWW-Authenticate', 'Basic').status(401).send('<h1>Unauthorized</h1>');
                return;
            }
        }
    }
}
