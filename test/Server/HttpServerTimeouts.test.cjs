const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const test = require('node:test');
const applyHttpServerTimeouts = require('../../build/Server/HttpServerTimeouts').default;

test('preserves Node HTTP server defaults when timeout variables are absent', () => {
    const server = createServer();
    const defaults = {
        requestTimeout: server.requestTimeout,
        headersTimeout: server.headersTimeout,
        timeout: server.timeout,
    };

    applyHttpServerTimeouts(server, {});

    assert.deepEqual(
        {
            requestTimeout: server.requestTimeout,
            headersTimeout: server.headersTimeout,
            timeout: server.timeout,
        },
        defaults,
    );
});

test('applies explicit request, headers and socket timeout values', () => {
    const server = createServer();

    applyHttpServerTimeouts(server, {
        HTTP_REQUEST_TIMEOUT_MS: '300000',
        HTTP_HEADERS_TIMEOUT_MS: '60000',
        HTTP_SOCKET_TIMEOUT_MS: '0',
    });

    assert.equal(server.requestTimeout, 300000);
    assert.equal(server.headersTimeout, 60000);
    assert.equal(server.timeout, 0);
});

for (const [name, environment] of [
    ['empty request timeout', { HTTP_REQUEST_TIMEOUT_MS: '' }],
    ['zero request timeout', { HTTP_REQUEST_TIMEOUT_MS: '0' }],
    ['negative headers timeout', { HTTP_HEADERS_TIMEOUT_MS: '-1' }],
    ['fractional socket timeout', { HTTP_SOCKET_TIMEOUT_MS: '1.5' }],
    ['non-numeric socket timeout', { HTTP_SOCKET_TIMEOUT_MS: 'never' }],
]) {
    test(`rejects ${name}`, () => {
        assert.throws(() => applyHttpServerTimeouts(createServer(), environment), /must be/);
    });
}

test('rejects a headers timeout greater than the request timeout', () => {
    assert.throws(
        () =>
            applyHttpServerTimeouts(createServer(), {
                HTTP_REQUEST_TIMEOUT_MS: '1000',
                HTTP_HEADERS_TIMEOUT_MS: '1001',
            }),
        /HTTP_HEADERS_TIMEOUT_MS must be less than or equal to HTTP_REQUEST_TIMEOUT_MS/,
    );
});
