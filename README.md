# Sosise
Sosise is a web application boilerplate/framework with an expressive, elegant syntax. A Sosise provides a structure and starting point for creating your application, allowing you to focus on creating something amazing while we sweat the details.

## Documentation
Documentation is available at https://sosise.github.io/sosise-docs

## Inspiration
Sosise is inspired by Laravel

## Installation
Install `sosise-cli` via `npm` or `yarn` globally.

```sh
npm i sosise-cli -g
```

## Usage
Use `new` to generate your project.

```sh
sosise new <name>
```

## HTTP Server

Existing applications keep the default global body parsers and response compression:

```ts
import Server from 'sosise-core/build/Server/Server';

const server = new Server();
server.run();
```

Applications that need exact request or response stream handling can disable those global middlewares and register them on individual routes instead:

```ts
const server = new Server({
    globalBodyParsers: false,
    compression: false,
});

server.run();
```

For application-owned lifecycle integration, `start()` resolves after the server begins listening and returns its Node.js HTTP server. `stop()` stops accepting new connections, waits for active connections to close and releases built-in session-store resources owned by the server.

## License
[MIT](LICENSE.md)
