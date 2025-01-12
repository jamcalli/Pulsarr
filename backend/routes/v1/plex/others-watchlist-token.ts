import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { getOthersWatchlist, processWatchlistItems } from '../../../plex/utils/plex';
import { getConfig } from '../../../utils/config-manager';
import { Type } from '@sinclair/typebox';
import { getDbInstance } from '../../../db/db';
import { Item as WatchlistItem, TokenWatchlistItem, Friend } from '../../../plex/types/plex.types';

const othersWatchlistSchema = {
  response: {
    200: Type.Union([
      Type.Object({
        total: Type.Number(),
        users: Type.Array(Type.Object({
          user: Type.Object({
            watchlistId: Type.String(),
            username: Type.String()
          }),
          watchlist: Type.Array(Type.Object({
            title: Type.String(),
            plexKey: Type.String(),
            type: Type.String(),
            guids: Type.Array(Type.String()),
            genres: Type.Array(Type.String())
          }))
        }))
      }),
      Type.Object({
        error: Type.String()
      })
    ])
  }
};

export const othersWatchlistTokenRoute: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get('/others-watchlist-token', {
    schema: othersWatchlistSchema
  }, async (request, reply) => {
    const config = getConfig(fastify.log);
    const db = getDbInstance(fastify.log);

    if (!config.plexTokens || config.plexTokens.length === 0) {
      reply.code(500).send({ error: 'No Plex token configured' });
      return;
    }

    try {
      // Fetch watchlist items for all friends
      const userWatchlistMap = await getOthersWatchlist(config, fastify.log);
      
      if (userWatchlistMap.size === 0) {
        reply.code(500).send({ error: 'Unable to fetch others\' watchlist items' });
        return;
      }

      // Extract unique keys and user-key relationships
      const allKeys = new Set<string>();
      const userKeyMap = new Map<string, Set<string>>();
      
      userWatchlistMap.forEach((items: Set<TokenWatchlistItem>, user: Friend) => {
        const userKeys = new Set<string>();
        items.forEach(item => {
          allKeys.add(item.id);
          userKeys.add(item.id);
        });
        userKeyMap.set(user.watchlistId, userKeys);
      });

      fastify.log.info(`Collected ${userKeyMap.size} users and ${allKeys.size} unique keys`);

      // Query existing items using both users and keys
      const allUsers = Array.from(userKeyMap.keys());
      const existingItems = db.getBulkWatchlistItems(allUsers, Array.from(allKeys));
      fastify.log.info(`Found ${existingItems.length} existing items in database`);

      // Map existing items by key and user
      const existingItemsByKey = new Map<string, Map<string, WatchlistItem>>();
      existingItems.forEach(item => {
        if (item.user && item.key) {
          if (!existingItemsByKey.has(item.key)) {
            existingItemsByKey.set(item.key, new Map());
          }
          existingItemsByKey.get(item.key)!.set(item.user, item);
        }
      });

      // Separate into new items and existing items needing links
      const brandNewItems = new Map<Friend, Set<TokenWatchlistItem>>();
      const existingItemsToLink = new Map<Friend, Set<WatchlistItem>>();

      userWatchlistMap.forEach((items, user) => {
        const newItems = new Set<TokenWatchlistItem>();
        const itemsToLink = new Set<WatchlistItem>();

        items.forEach(item => {
          const existingItem = existingItemsByKey.get(item.id);
          if (!existingItem) {
            // Item doesn't exist at all - needs full processing
            newItems.add(item);
          } else if (!existingItem.has(user.watchlistId)) {
            // Item exists but not for this user - just needs linking
            const templateItem = existingItem.values().next().value;
            if (templateItem && templateItem.title && templateItem.type) {
              itemsToLink.add({
                user: user.watchlistId,
                title: templateItem.title,
                key: item.id,
                type: templateItem.type,
                guids: templateItem.guids || [],
                genres: templateItem.genres || []
              });
            }
          }
        });

        if (newItems.size > 0) {
          brandNewItems.set(user, newItems);
        }
        if (itemsToLink.size > 0) {
          existingItemsToLink.set(user, itemsToLink);
        }
      });

      // Process brand new items
      let processedItems = new Map<Friend, Set<WatchlistItem>>();
      if (brandNewItems.size > 0) {
        processedItems = await processWatchlistItems(config, fastify.log, brandNewItems);
        
        const itemsToInsert = Array.from(processedItems.entries()).flatMap(([user, items]) => 
          Array.from(items).map(item => ({
            user: user.watchlistId,
            title: item.title,
            key: item.key,
            type: item.type,
            guids: item.guids || [],
            genres: item.genres || []
          }))
        );

        if (itemsToInsert.length > 0) {
          db.createWatchlistItems(itemsToInsert);
          fastify.log.info(`Processed and inserted ${itemsToInsert.length} new items`);
        }
      }

      // Link existing items to new users
      const linkItems = Array.from(existingItemsToLink.values())
        .flatMap(items => Array.from(items));
      
      if (linkItems.length > 0) {
        db.createWatchlistItems(linkItems);
        fastify.log.info(`Linked ${linkItems.length} existing items to new users`);
      }

      // Build response
      const response = {
        total: existingItems.length + linkItems.length + 
          Array.from(processedItems.values()).reduce((acc, items) => acc + items.size, 0),
        users: Array.from(userWatchlistMap.keys()).map(user => ({
          user: {
            watchlistId: user.watchlistId,
            username: user.username
          },
          watchlist: [
            // Include existing items
            ...existingItems
              .filter(item => item.user === user.watchlistId)
              .map(item => ({
                title: item.title,
                plexKey: item.key,
                type: item.type,
                guids: typeof item.guids === 'string' ? 
                  JSON.parse(item.guids) : item.guids || [],
                genres: typeof item.genres === 'string' ? 
                  JSON.parse(item.genres) : item.genres || []
              })),
            // Include newly linked items
            ...(existingItemsToLink.has(user) ? 
              Array.from(existingItemsToLink.get(user)!).map(item => ({
                title: item.title,
                plexKey: item.key,
                type: item.type,
                guids: item.guids || [],
                genres: item.genres || []
              })) : []),
            // Include newly processed items
            ...(processedItems.has(user) ? 
              Array.from(processedItems.get(user)!).map(item => ({
                title: item.title,
                plexKey: item.key,
                type: item.type,
                guids: item.guids || [],
                genres: item.genres || []
              })) : [])
          ]
        }))
      };

      reply.send(response);
    } catch (err) {
      fastify.log.error(err);
      reply.code(500).send({ error: 'Unable to fetch others\' watchlist items' });
    }
  });
};