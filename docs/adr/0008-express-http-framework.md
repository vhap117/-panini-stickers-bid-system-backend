# Express as the HTTP framework

The HTTP framework is Express. We chose Express over Fastify (schema-first validation, better performance) and NestJS (full opinionated framework with DI) because of its ubiquity, minimal footprint, and the fact that every relevant library and Socket.IO integrates with it cleanly. Express brings no opinions on structure, so the codebase assembles its own validation, error handling, and layering — accepted as a trade-off for the lowest learning curve and the largest body of community examples. Socket.IO attaches to the Express HTTP server directly.
