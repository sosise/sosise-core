import { NextFunction, Request, Response } from 'express';
import { match } from 'path-to-regexp';
import ipRangeCheck from 'ip-range-check';
const config = require(process.cwd() + '/build/config/throttling').default;

export default class DocumentationBasicAuthMiddleware {
    private rateLimitMap: Map<string, { count: number; windowStartTs: number }> = new Map();

    /**
     * This method handles the middleware
     */
    public async handle(request: Request, response: Response, next: NextFunction): Promise<any> {
        // In case throttling is disabled
        if (!config.isEnabled) {
            return next();
        }

        // Get client IP
        const clientIp = this.getClientIp(request);

        // In case client IP is not set
        if (!clientIp) {
            return next();
        }

        // Now check if the client IP is in a list of subnets that should be excluded
        if (ipRangeCheck(clientIp, config.skipSubnets)) {
            return next();
        }

        // Get some variables to do throttling
        const method = request.method.toLowerCase();
        const urlPath = request.path;
        const compiledRules = this.compileRules();

        // 3. Ищем подходящее правило (в том порядке, в котором мы их указали в throttlingConfig.routeRules)
        let matchedRule: any = null;
        for (const rule of compiledRules) {
            if (rule.httpMethod !== method) {
                continue;
            }

            const result = rule.matcher(urlPath);
            if (result) {
                matchedRule = rule;
                break;
            }
        }

        // 4. Если правило не нашлось → просто next()
        if (!matchedRule) {
            return next();
        }

        // 5. Далее — логика rate limiting, которую мы уже описывали
        const key = `${clientIp}|${matchedRule.httpMethod}|${matchedRule.path}`;
        const nowTs = Date.now();
        const windowSizeMs = 60 * 1000;

        const entry = this.rateLimitMap.get(key);
        if (!entry) {
            this.rateLimitMap.set(key, { count: 1, windowStartTs: nowTs });
            return next();
        }

        if (nowTs - entry.windowStartTs >= windowSizeMs) {
            this.rateLimitMap.set(key, { count: 1, windowStartTs: nowTs });
            return next();
        }

        if (entry.count < matchedRule.maxRequestsPerMinute) {
            entry.count += 1;
            return next();
        }

        // превысил лимит
        return response.status(429).json({
            error: 'Too Many Requests',
            message: `Exceeded ${matchedRule.maxRequestsPerMinute} requests per minute for [${matchedRule.httpMethod.toUpperCase()}] ${matchedRule.path}`,
        });
    }

    /**
     * Compile rules
     */
    private compileRules(): any {
        return config.routeRules.map((rule: any) => ({
            httpMethod: rule.httpMethod.toLowerCase(),
            path: rule.path,
            maxRequestsPerMinute: rule.maxRequestsPerMinute,
            matcher: match(rule.path, { decode: decodeURIComponent }),
        }));
    }

    /**
     * Get client ip
     */
    private getClientIp(request: Request): string | undefined {
        // Get string from header
        let clientIp: string | undefined = request.headers[config.clientIpHeader.toLowerCase()] as any;

        // In case client ip is string and contains ','
        if (typeof clientIp === 'string' && clientIp.includes(',')) {
            clientIp = clientIp.split(',')[0].trim();
        }

        // In case client ip is undefined
        if (!clientIp) {
            return undefined;
        }

        // Otherwise just return
        return clientIp;
    }
}
