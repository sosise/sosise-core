const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { request: httpRequest } = require('node:http');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');
const Express = require('express');

// The middleware reads the throttling config of the application from the working directory when it is loaded,
// so it is loaded from a directory holding a config of its own, and the tests change that one config object
const applicationDirectory = mkdtempSync(join(tmpdir(), 'sosise-throttling-'));
mkdirSync(join(applicationDirectory, 'build', 'config'), { recursive: true });
writeFileSync(
    join(applicationDirectory, 'build', 'config', 'throttling.js'),
    "exports.default = { isEnabled: true, clientIpHeader: null, skipSubnets: [], routeRules: [{ httpMethod: 'POST', path: '/login', maxRequestsPerMinute: 1 }] };",
);
const frameworkDirectory = process.cwd();
process.chdir(applicationDirectory);
const ThrottlingMiddleware = require(join(frameworkDirectory, 'build', 'Middlewares', 'ThrottlingMiddleware')).default;
const config = require(join(applicationDirectory, 'build', 'config', 'throttling')).default;
process.chdir(frameworkDirectory);

test.after(() => rmSync(applicationDirectory, { recursive: true, force: true }));

/**
 * Run one request through the middleware and tell whether it was let through or refused
 */
async function attempt(middleware, request) {
    let statusCode = null;
    let passed = false;
    const response = {
        status(code) {
            statusCode = code;

            return this;
        },
        json() {
            return this;
        },
    };

    await middleware.handle({ method: 'POST', path: '/login', headers: {}, ...request }, response, () => {
        passed = true;
    });

    return passed ? 'passed' : statusCode;
}

/**
 * Start an application that trusts the given proxies and throttles through a fresh middleware
 */
function listen(trustProxy) {
    const middleware = new ThrottlingMiddleware();
    const application = Express();
    application.set('trust proxy', trustProxy);
    application.use(middleware.handle.bind(middleware));
    application.post('/login', (request, response) => response.status(204).end());

    return new Promise((resolve) => {
        const server = application.listen(0, '127.0.0.1', () => resolve(server));
    });
}

/**
 * Post to the application with the given forwarded chain and resolve with the status code
 */
function post(server, forwardedFor) {
    return new Promise((resolve, reject) => {
        const clientRequest = httpRequest(
            {
                port: server.address().port,
                host: '127.0.0.1',
                method: 'POST',
                path: '/login',
                headers: { 'X-Forwarded-For': forwardedFor },
            },
            (response) => {
                response.resume();
                response.on('end', () => resolve(response.statusCode));
            },
        );

        clientRequest.on('error', reject);
        clientRequest.end();
    });
}

test('keys by the address Express resolved when no header is configured', async () => {
    config.clientIpHeader = null;
    const middleware = new ThrottlingMiddleware();

    // A different X-Forwarded-For on every attempt does not make a new client
    assert.equal(await attempt(middleware, { ip: '203.0.113.7', headers: { 'x-forwarded-for': '198.51.100.1' } }), 'passed');
    assert.equal(await attempt(middleware, { ip: '203.0.113.7', headers: { 'x-forwarded-for': '198.51.100.2' } }), 429);

    // Another client keeps a limit of its own
    assert.equal(await attempt(middleware, { ip: '203.0.113.8' }), 'passed');
});

test('cannot be bypassed by a forged X-Forwarded-For behind two appending proxies', async () => {
    config.clientIpHeader = null;

    // haproxy appends the client it saw, nginx appends haproxy: only the leftmost entry is the client's own text
    const server = await listen(2);
    try {
        assert.equal(await post(server, '1.1.1.1, 203.0.113.7, 10.0.0.1'), 204);
        assert.equal(await post(server, '2.2.2.2, 203.0.113.7, 10.0.0.1'), 429);
    } finally {
        server.close();
    }
});

test('still reads the leftmost entry of a configured header', async () => {
    config.clientIpHeader = 'X-Forwarded-For';
    const middleware = new ThrottlingMiddleware();

    // The legacy mode is unchanged: it is only safe for a header a trusted proxy overwrites
    assert.equal(await attempt(middleware, { ip: '203.0.113.7', headers: { 'x-forwarded-for': '198.51.100.1, 10.0.0.1' } }), 'passed');
    assert.equal(await attempt(middleware, { ip: '203.0.113.7', headers: { 'x-forwarded-for': '198.51.100.2, 10.0.0.1' } }), 'passed');
    assert.equal(await attempt(middleware, { ip: '203.0.113.7', headers: { 'x-forwarded-for': '198.51.100.2, 10.0.0.1' } }), 429);
});

test('matches skipped subnets against an IPv6-mapped IPv4 address', async () => {
    config.clientIpHeader = null;
    config.skipSubnets = ['10.0.0.0/24'];
    const middleware = new ThrottlingMiddleware();

    // A dual-stack socket reports "::ffff:10.0.0.5", and the subnet is written as IPv4
    try {
        assert.equal(await attempt(middleware, { ip: '::ffff:10.0.0.5' }), 'passed');
        assert.equal(await attempt(middleware, { ip: '::ffff:10.0.0.5' }), 'passed');
    } finally {
        config.skipSubnets = [];
    }
});

test('lets a request through when Express knows no address', async () => {
    config.clientIpHeader = null;

    // Nothing to key by is not a reason to refuse the request
    assert.equal(await attempt(new ThrottlingMiddleware(), { ip: undefined }), 'passed');
});
