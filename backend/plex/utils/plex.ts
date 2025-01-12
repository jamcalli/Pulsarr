import { FastifyBaseLogger } from 'fastify';
import { PlexResponse, Item, TokenWatchlistItem, GraphQLQuery, Friend, PlexApiResponse } from '@plex/types/plex.types';
import { Config } from '@shared/types/config.types';

export const pingPlex = async (token: string, log: FastifyBaseLogger): Promise<void> => {
  try {
    const url = new URL('https://plex.tv/api/v2/ping');
    url.searchParams.append('X-Plex-Token', token);
    url.searchParams.append('X-Plex-Client-Identifier', 'watchlistarr');
    
    await fetch(url.toString());
    log.info('Pinged plex.tv to update access token expiry');
  } catch (err) {
    log.warn(`Unable to ping plex.tv: ${err}`);
  }
};

export const getWatchlist = async (
  token: string, 
  log: FastifyBaseLogger, 
  start: number = 0,
  retryCount = 0
): Promise<PlexResponse> => {
  if (!token) {
    throw new Error('No Plex token provided');
  }
  const containerSize = 300;
  const url = new URL('https://metadata.provider.plex.tv/library/sections/watchlist/all');
  url.searchParams.append('X-Plex-Token', token);
  url.searchParams.append('X-Plex-Container-Start', start.toString());
  url.searchParams.append('X-Plex-Container-Size', containerSize.toString());
  
  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json'
    }
  });
  
  const contentType = response.headers.get('Content-Type');
  if (!response.ok) {
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000 * Math.pow(2, retryCount);
      log.warn(`Rate limited. Retrying after ${retryAfterMs} ms. Attempt ${retryCount + 1}`);
      await new Promise(resolve => setTimeout(resolve, retryAfterMs));
      return getWatchlist(token, log, start, retryCount + 1);
    }
    throw new Error(`Plex API error: ${response.statusText}`);
  }
  
  if (contentType && contentType.includes('application/json')) {
    return response.json() as Promise<PlexResponse>;
  } else {
    throw new Error(`Unexpected content type: ${contentType}`);
  }
};

export const getSelfWatchlist = async (
  config: Config,
  log: FastifyBaseLogger
): Promise<Set<Item>> => {
  const allItems = new Set<Item>();
  
  for (const token of config.plexTokens) {
    let currentStart = 0;
    
    while (true) {
      try {
        log.debug(`Fetching watchlist for token with start: ${currentStart}`);
        const response = await getWatchlist(token, log, currentStart);
        
        const items = response.MediaContainer.Metadata.map((metadata) => {
          const id = metadata.key
            .replace('/library/metadata/', '')
            .replace('/children', '');
          
          return {
            title: metadata.title,
            id,
            key: id,
            type: metadata.type,
            guids: metadata.Guid?.map((guid) => guid.id) || [],
            genres: metadata.Genre?.map((genre) => genre.tag) || []
          };
        });
        
        log.debug(`Found ${items.length} items in current page`);
        
        for (const item of items) {
          const detailedItems = await toItems(config, log, item as TokenWatchlistItem);
          detailedItems.forEach((detailedItem: Item) => allItems.add(detailedItem));
        }
        
        if (response.MediaContainer.totalSize <= currentStart + items.length) {
          log.debug(`Completed processing all pages for current token`);
          break;
        }
        
        currentStart += items.length;
        
      } catch (err) {
        log.error(`Error fetching watchlist: ${err}`);
        break;
      }
    }
  }
  
  log.info(`Self watchlist fetched successfully with ${allItems.size} total items`);
  return allItems;
};

export const getFriends = async (config: Config, log: FastifyBaseLogger): Promise<Set<[Friend, string]>> => {
  const allFriends = new Set<[Friend, string]>();

  for (const token of config.plexTokens) {
    const url = new URL('https://community.plex.tv/api');
    const query: GraphQLQuery = {
      query: `query GetAllFriends {
        allFriendsV2 {
          user {
            id
            username
          }
        }
      }`
    };

    try {
      log.debug(`Fetching friends with token: ${token}`);
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Plex-Token': token
        },
        body: JSON.stringify(query)
      });

      if (!response.ok) {
        log.warn(`Unable to fetch friends from Plex: ${response.statusText}`);
        continue;
      }

      const json = await response.json() as PlexApiResponse;
      log.debug(`Response JSON: ${JSON.stringify(json)}`);
      if (json.errors) {
        log.warn(`GraphQL errors: ${JSON.stringify(json.errors)}`);
        continue;
      }

      if (json.data?.allFriendsV2) {
        const friends = json.data.allFriendsV2.map((friend: { user: { id: string; username: string } }) => 
          [{ watchlistId: friend.user.id, username: friend.user.username }, token] as [Friend, string]
        );
        
        if (friends.length === 0) {
          log.warn(`No friends found for token: ${token}`);
          continue;
        }

        friends.forEach((friend: [Friend, string]) => {
          allFriends.add(friend);
          log.debug(`Added friend: ${JSON.stringify(friend)}`);
        });
      }
    } catch (err) {
      log.warn(`Unable to fetch friends from Plex: ${err}`);
    }
  }
  
  log.info("All friends fetched successfully.");
  return allFriends;
};

export const getWatchlistIdsForUser = async (
  config: Config,
  log: FastifyBaseLogger,
  token: string,
  user: Friend,
  page: string | null = null
): Promise<Set<TokenWatchlistItem>> => {
  const allItems = new Set<TokenWatchlistItem>();
  const url = new URL('https://community.plex.tv/api');
  
  if (!user || !user.watchlistId) {
    log.error('Invalid user object provided to getWatchlistIdsForUser');
    return allItems;
  }

  const query: GraphQLQuery = {
    query: `query GetWatchlistHub ($uuid: ID!, $first: PaginationInt!, $after: String) {
      user(id: $uuid) {
        watchlist(first: $first, after: $after) {
          nodes {
            id
            title
            type
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }`,
    variables: {
      uuid: user.watchlistId,
      first: 100,
      after: page
    }
  };

  log.debug(`Fetching watchlist for user: ${user.username}, UUID: ${user.watchlistId}`);

  try {
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Plex-Token': token
      },
      body: JSON.stringify(query)
    });

    if (!response.ok) {
      throw new Error(`Plex API error: ${response.statusText}`);
    }

    const json = await response.json() as PlexApiResponse;
    log.debug(`Response JSON: ${JSON.stringify(json)}`);
    
    if (json.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
    }
    
    if (json.data?.user?.watchlist) {
      const watchlist = json.data.user.watchlist;
      watchlist.nodes.forEach((item: TokenWatchlistItem) => allItems.add(item));

      if (watchlist.pageInfo.hasNextPage && watchlist.pageInfo.endCursor) {
        const nextPageItems = await getWatchlistIdsForUser(config, log, token, user, watchlist.pageInfo.endCursor);
        nextPageItems.forEach((item: TokenWatchlistItem) => allItems.add(item));
      }
    }
  } catch (err) {
    log.error(`Unable to fetch watchlist for user ${user.username}: ${err}`);
  }

  return allItems;
};

export const getOthersWatchlist = async (config: Config, log: FastifyBaseLogger): Promise<Map<Friend, Set<TokenWatchlistItem>>> => {
  const userWatchlistMap = new Map<Friend, Set<TokenWatchlistItem>>();

  try {
    const friends = await getFriends(config, log);
    for (const [user, token] of friends) {
      log.debug(`Processing friend: ${JSON.stringify(user)}`);
      const watchlistItems = await getWatchlistIdsForUser(config, log, token, user);
      userWatchlistMap.set(user, watchlistItems);
    }
    const totalItems = Array.from(userWatchlistMap.values()).reduce((acc, items) => acc + items.size, 0);
    log.info(`Others' watchlist fetched successfully with ${totalItems} total items`);
  } catch (err) {
    log.error(`Unable to fetch others' watchlist: ${err}`);
  }

  return userWatchlistMap;
};

export const processWatchlistItems = async (
  config: Config,
  log: FastifyBaseLogger,
  userWatchlistMap: Map<Friend, Set<TokenWatchlistItem>>
): Promise<Map<Friend, Set<Item>>> => {
  const userDetailedWatchlistMap = new Map<Friend, Set<Item>>();

  for (const [user, watchlistItems] of userWatchlistMap) {
    const detailedItems = new Set<Item>();
    for (const item of watchlistItems) {
      const items = await toItems(config, log, item);
      items.forEach((detailedItem: Item) => detailedItems.add(detailedItem));
    }
    userDetailedWatchlistMap.set(user, detailedItems);
  }

  return userDetailedWatchlistMap;
};

const toItems = async (config: Config, log: FastifyBaseLogger, item: TokenWatchlistItem): Promise<Set<Item>> => {
  const allItems = new Set<Item>();
  const url = new URL(`https://discover.provider.plex.tv/library/metadata/${item.id}`);
  url.searchParams.append('X-Plex-Token', config.plexTokens[0]);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Plex API error: ${response.statusText}`);
    }

    const json = await response.json() as PlexApiResponse;
    if (!json.MediaContainer || !json.MediaContainer.Metadata) {
      throw new Error('Invalid response structure');
    }

    const guids = json.MediaContainer.Metadata.flatMap((metadata: any) => 
      metadata.Guid?.map((guid: any) => guid.id.replace('//', '')) || []
    );
    const genres = json.MediaContainer.Metadata.flatMap((metadata: any) => 
      metadata.Genre?.map((genre: any) => genre.tag) || []
    );

    allItems.add({ title: item.title, key: item.id, type: item.type, guids, genres });
  } catch (err) {
    const error = err as Error;
    if (error.message.includes('Plex API error')) {
      log.warn(`Found item ${item.title} on the watchlist, but we cannot find this in Plex's database.`);
    } else {
      log.error(`Unable to fetch item details for ${item.title}: ${error}`);
    }
  }

  return allItems;
};

export const getPlexWatchlistUrls = async (
  tokens: Set<string>,
  skipFriendSync: boolean,
  log: FastifyBaseLogger
): Promise<Set<string>> => {
  const watchlistsFromTokenIo = await Promise.all(
    Array.from(tokens).map(async (token) => {
      const selfWatchlist = await getRssFromPlexToken(token, 'watchlist', log);
      log.info(`Generated watchlist RSS feed for self: ${selfWatchlist}`);
      const friendsWatchlist = skipFriendSync ? null : await getRssFromPlexToken(token, 'friendsWatchlist', log);
      log.info(`Generated watchlist RSS feed for friends: ${friendsWatchlist}`);
      return [selfWatchlist, friendsWatchlist].filter(Boolean) as string[];
    })
  );

  const watchlistsFromToken = new Set<string>(watchlistsFromTokenIo.flat());

  if (watchlistsFromToken.size === 0) {
    log.warn('Missing RSS URL. Are you an active Plex Pass user?');
    log.warn('Real-time RSS sync disabled');
  }

  return watchlistsFromToken;
};

export const getRssFromPlexToken = async (
  token: string,
  rssType: string,
  log: FastifyBaseLogger
): Promise<string | null> => {
  const url = new URL('https://discover.provider.plex.tv/rss');
  url.searchParams.append('X-Plex-Token', token);
  url.searchParams.append('X-Plex-Client-Identifier', 'watchlistarr');
  url.searchParams.append('format', 'json');

  const body = JSON.stringify({ feedType: rssType });

  try {
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body
    });

    if (!response.ok) {
      log.warn(`Unable to generate an RSS feed: ${response.statusText}`);
      return null;
    }

    const json = await response.json() as PlexApiResponse;
    log.debug('Got a result from Plex when generating RSS feed, attempting to decode');
    return json.RSSInfo?.[0]?.url || null;
  } catch (err) {
    log.warn(`Unable to generate an RSS feed: ${err}`);
    return null;
  }
};