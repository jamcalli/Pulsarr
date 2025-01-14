import { FastifyInstance } from 'fastify';
import { getDbInstance } from '@db/db';

export function gracefulShutdown(server: FastifyInstance) {
  ['SIGTERM', 'SIGINT'].forEach((signal) => {
    process.on(signal, async () => {
      server.log.info(`Received ${signal}, shutting down...`);

      // Force exit after 5 seconds
      const forceExit = setTimeout(() => {
        server.log.error('Forced exit due to timeout');
        process.exit(1);
      }, 5000);

      try {
        // Close DB first
        const db = getDbInstance(server.log);
        server.log.info('Closing database connection...');
        db.database.close();
        server.log.info('Database connection closed');

        // Then close server
        server.log.info('Closing server...');
        await server.close();
        server.log.info('Server closed');

        // Clean exit
        clearTimeout(forceExit);
        server.log.info('Cleanup complete, exiting...');
        process.exit(0);
      } catch (err) {
        server.log.error(`Error during shutdown: ${err}`);
        clearTimeout(forceExit);
        process.exit(1);
      }
    });
  });
}