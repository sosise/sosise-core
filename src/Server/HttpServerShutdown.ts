import { Server as HttpServer } from 'node:http';

/**
 * Stop an HTTP server without waiting for keep-alive clients forever
 *
 * A bare `server.close()` only resolves once every socket is gone, and a keep-alive
 * client holds its socket open between requests. Idle sockets are therefore dropped
 * immediately and the sockets still serving a request get a bounded grace period.
 */
export default async function stopHttpServer(server: HttpServer, shutdownTimeoutMs: number): Promise<void> {
    // Refuse new connections and release sockets that are merely waiting for another request
    server.closeIdleConnections();

    let forcedCloseTimer: NodeJS.Timeout | undefined;

    try {
        await new Promise<void>((resolve, reject) => {
            server.close((error?: Error) => (error ? reject(error) : resolve()));

            // Cut the remaining in-flight connections once the grace period expires
            forcedCloseTimer = setTimeout(() => server.closeAllConnections(), shutdownTimeoutMs);
        });
    } finally {
        // Never leave the grace timer behind, it would keep the event loop alive
        clearTimeout(forcedCloseTimer);
    }
}
