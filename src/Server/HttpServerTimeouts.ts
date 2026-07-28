import { Server as HttpServer } from 'node:http';

type HttpServerTimeoutEnvironment = Record<string, string | undefined>;

export default function applyHttpServerTimeouts(server: HttpServer, environment: HttpServerTimeoutEnvironment = process.env): void {
    // Resolve configured values while preserving Node defaults when omitted
    const requestTimeout = parseTimeout(environment.HTTP_REQUEST_TIMEOUT_MS, server.requestTimeout, false, 'HTTP_REQUEST_TIMEOUT_MS');
    const headersTimeout = parseTimeout(environment.HTTP_HEADERS_TIMEOUT_MS, server.headersTimeout, false, 'HTTP_HEADERS_TIMEOUT_MS');
    const socketTimeout = parseTimeout(environment.HTTP_SOCKET_TIMEOUT_MS, server.timeout, true, 'HTTP_SOCKET_TIMEOUT_MS');

    // Reject a headers timeout that outlives the complete request budget
    if (headersTimeout > requestTimeout) {
        throw new Error('HTTP_HEADERS_TIMEOUT_MS must be less than or equal to HTTP_REQUEST_TIMEOUT_MS.');
    }

    // Apply request ingestion and established-socket inactivity limits
    server.requestTimeout = requestTimeout;
    server.headersTimeout = headersTimeout;
    server.timeout = socketTimeout;
}

function parseTimeout(value: string | undefined, fallback: number, allowZero: boolean, name: string): number {
    // Preserve the runtime default when the variable is absent
    if (value === undefined) {
        return fallback;
    }

    // Require a canonical non-negative integer value
    const normalizedValue = value.trim();
    const timeout = Number(normalizedValue);
    const minimum = allowZero ? 0 : 1;

    if (!normalizedValue || !Number.isSafeInteger(timeout) || timeout < minimum) {
        throw new Error(`${name} must be ${allowZero ? 'a non-negative' : 'a positive'} integer number of milliseconds.`);
    }

    return timeout;
}
