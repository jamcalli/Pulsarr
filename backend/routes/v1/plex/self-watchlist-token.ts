import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { fetchSelfWatchlist, processWatchlistItems } from '@plex/utils/plex';
import { getConfig } from '@shared/config/config-manager';
import { getDbInstance } from '@db/db';
import { TokenWatchlistItem, Item } from '@plex/types/plex.types';
import { selfWatchlistSchema } from '@schemas/plex/self-watchlist-token.schema';

export const selfWatchlistTokenRoute: FastifyPluginAsyncZod = async function(fastify, _opts) {
  fastify.route({
    method: 'GET',
    url: '/self-watchlist-token',
    schema: selfWatchlistSchema,
    handler: async (_request, reply) => {
      const config = getConfig(fastify.log);
      const db = getDbInstance(fastify.log);

      if (!config.plexTokens || config.plexTokens.length === 0) {
        reply.code(500).send({ error: 'No Plex token configured' });
        return;
      }

      try {
        const items = await fetchSelfWatchlist(config, fastify.log);
        if (items.size === 0) {
          reply.code(500).send({ error: 'Unable to fetch watchlist items' });
          return;
        }

        // Check if items already exist in the database
        const allKeys = Array.from(items).map(item => item.id);
        const existingItems = db.getBulkWatchlistItems(['self'], allKeys);
        fastify.log.info(`Found ${existingItems.length} existing items in database`);

        const existingItemsByKey = new Map<string, any>();
        existingItems.forEach(item => {
          if (item.key) {
            existingItemsByKey.set(item.key, item);
          }
        });

        // Separate new and existing items
        const newItems = new Set<TokenWatchlistItem>();
        items.forEach(item => {
          if (!existingItemsByKey.has(item.id)) {
            newItems.add(item);
          }
        });

        const formattedExistingItems = existingItems.map(item => ({
          title: item.title,
          key: item.key,
          type: item.type,
          guids: typeof item.guids === 'string' ? JSON.parse(item.guids) : [],
          genres: typeof item.genres === 'string' ? JSON.parse(item.genres) : []
        }));

        // Process new items
        let processedItems = new Set<Item>();
        if (newItems.size > 0) {
          const result = await processWatchlistItems(config, fastify.log, newItems);
          if (result instanceof Set) {
            processedItems = result;
            const itemsToInsert = Array.from(processedItems).map(item => ({
              user: 'self',
              title: item.title,
              key: item.key,
              type: item.type,
              guids: item.guids || [],
              genres: item.genres || []
            }));

            if (itemsToInsert.length > 0) {
              db.createWatchlistItems(itemsToInsert);
              fastify.log.info(`Processed and inserted ${itemsToInsert.length} new items`);
            }
          } else {
            throw new Error('Expected Set<Item> from processWatchlistItems');
          }
        }

        // Combine existing and processed items
        const combinedItems = [
          ...formattedExistingItems,
          ...Array.from(processedItems)
        ];

        const response = {
          total: combinedItems.length,
          items: combinedItems.map(item => ({
            title: item.title,
            plexKey: item.key,
            type: item.type,
            guids: item.guids ?? [],
            genres: item.genres ?? []
          }))
        };
        
        reply.send(response);
      } catch (err) {
        fastify.log.error(err);
        reply.code(500).send({ error: 'Unable to fetch watchlist items' });
      }
    }
  });
};