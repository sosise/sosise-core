const assert = require('node:assert/strict');
const { Agent, createServer, request } = require('node:http');
const test = require('node:test');
const stopHttpServer = require('../../build/Server/HttpServerShutdown').default;

/**
 * Start a server on an ephemeral port and resolve with it
 */
function listen(requestListener) {
    const server = createServer(requestListener);

    return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

/**
 * Send a request through the given agent and resolve once the response is consumed
 */
function get(server, agent) {
    return new Promise((resolve, reject) => {
        const clientRequest = request({ port: server.address().port, agent }, (response) => {
            response.on('data', () => undefined);
            response.on('end', () => resolve());
        });

        clientRequest.on('error', reject);
        clientRequest.end();
    });
}

test('stops a server that has no connections', async () => {
    const server = await listen((request, response) => response.end('ok'));
    const startedAt = Date.now();

    await stopHttpServer(server, 60000);

    // Resolving anywhere near the grace period would mean the shutdown waited on the timer
    assert.ok(Date.now() - startedAt < 1000);
    assert.equal(server.listening, false);
});

test('does not wait for an idle keep-alive connection', async () => {
    const server = await listen((request, response) => response.end('ok'));
    const agent = new Agent({ keepAlive: true });

    await get(server, agent);

    const startedAt = Date.now();
    await stopHttpServer(server, 60000);

    assert.ok(Date.now() - startedAt < 1000);
    assert.equal(server.listening, false);

    agent.destroy();
});

test('cuts a connection that is still in flight once the grace period expires', async () => {
    // This handler never answers, so the connection stays busy until it is destroyed
    const server = await listen(() => undefined);
    const agent = new Agent({ keepAlive: true });
    const pendingRequest = get(server, agent).catch(() => undefined);

    // Wait until the server has actually accepted the connection
    await new Promise((resolve) => server.once('request', resolve));

    const startedAt = Date.now();
    await stopHttpServer(server, 200);
    const elapsed = Date.now() - startedAt;

    assert.ok(elapsed >= 150, `expected the grace period to elapse, took ${elapsed}ms`);
    assert.ok(elapsed < 5000, `expected a bounded shutdown, took ${elapsed}ms`);
    assert.equal(server.listening, false);

    await pendingRequest;
    agent.destroy();
});
