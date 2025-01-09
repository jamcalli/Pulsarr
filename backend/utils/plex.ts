import { FastifyBaseLogger } from 'fastify';
import { PlexConfig, PlexResponse, Item, User, TokenWatchlistItem, TokenWatchlistFriend, GraphQLQuery } from '../types/plex.types';

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

export const getWatchlist = async (token: string, containerStart = 0): Promise<PlexResponse> => {
  if (!token) {
    throw new Error('No Plex token provided');
  }

  const containerSize = 300;
  const url = new URL('https://metadata.provider.plex.tv/library/sections/watchlist/all');
  url.searchParams.append('X-Plex-Token', token);
  url.searchParams.append('X-Plex-Container-Start', containerStart.toString());
  url.searchParams.append('X-Plex-Container-Size', containerSize.toString());

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json'
    }
  });
  const contentType = response.headers.get('Content-Type');

  if (!response.ok) {
    throw new Error(`Plex API error: ${response.statusText}`);
  }

  if (contentType && contentType.includes('application/json')) {
    return response.json();
  } else {
    throw new Error(`Unexpected content type: ${contentType}`);
  }
};

export const getSelfWatchlist = async (
  config: PlexConfig,
  log: FastifyBaseLogger,
  containerStart = 0
): Promise<Set<Item>> => {
  const allItems = new Set<Item>();

  for (const token of config.plexTokens) {
    let hasNextPage = true;
    let currentStart = containerStart;

    while (hasNextPage) {
      try {
        const response = await getWatchlist(token, currentStart);
        const items = response.MediaContainer.Metadata.map((metadata) => ({
          title: metadata.title,
          key: metadata.key,
          type: metadata.type,
          guids: metadata.Guid?.map((guid) => guid.id) || []
        }));

        items.forEach((item) => allItems.add(item));

        if (response.MediaContainer.totalSize > currentStart + 300) {
          currentStart += 300;
        } else {
          hasNextPage = false;
        }
      } catch (err) {
        log.error(`Unable to fetch watchlist: ${err}`);
        hasNextPage = false;
      }
    }
  }

  return allItems;
};

export const getFriends = async (config: PlexConfig, log: FastifyBaseLogger): Promise<Set<[User, string]>> => {
  const allFriends = new Set<[User, string]>();

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

      const json = await response.json();
      log.debug(`Response JSON: ${JSON.stringify(json)}`);
      if (json.errors) {
        log.warn(`GraphQL errors: ${JSON.stringify(json.errors)}`);
        continue;
      }

      const friends = json.data.allFriendsV2.map((friend: { user: User }) => 
        [friend.user, token] as [User, string]
      );
      
      if (friends.length === 0) {
        log.warn(`No friends found for token: ${token}`);
        continue;
      }

      friends.forEach((friend: [User, string]) => {
        allFriends.add(friend);
        log.debug(`Added friend: ${JSON.stringify(friend)}`);
      });
    } catch (err) {
      log.warn(`Unable to fetch friends from Plex: ${err}`);
    }
  }
  
  log.info("All friends fetched successfully.");
  return allFriends;
};

export const getWatchlistIdsForUser = async (
  config: PlexConfig,
  log: FastifyBaseLogger,
  token: string,
  user: User,
  page: string | null = null
): Promise<Set<TokenWatchlistItem>> => {
  const allItems = new Set<TokenWatchlistItem>();
  const url = new URL('https://community.plex.tv/api');
  
  if (!user || !user.id) {
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
      uuid: user.id,
      first: 100,
      after: page
    }
  };

  log.debug(`Fetching watchlist for user: ${user.username}, UUID: ${user.id}`);

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

    const json: TokenWatchlistFriend = await response.json();
    log.debug(`Response JSON: ${JSON.stringify(json)}`);
    
    if (json.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
    }
    
    if (!json.data?.user?.watchlist) {
      throw new Error('Invalid response structure: missing watchlist data');
    }
    
    const watchlist = json.data.user.watchlist;
    watchlist.nodes.forEach((item: TokenWatchlistItem) => allItems.add(item));

    if (watchlist.pageInfo.hasNextPage && watchlist.pageInfo.endCursor) {
      const nextPageItems = await getWatchlistIdsForUser(config, log, token, user, watchlist.pageInfo.endCursor);
      nextPageItems.forEach((item: TokenWatchlistItem) => allItems.add(item));
    }
  } catch (err) {
    log.error(`Unable to fetch watchlist for user ${user.username}: ${err}`);
  }

  return allItems;
};

export const getOthersWatchlist = async (config: PlexConfig, log: FastifyBaseLogger): Promise<Set<Item>> => {
  const allItems = new Set<Item>();

  try {
    const friends = await getFriends(config, log);
    for (const [user, token] of friends) {
      log.debug(`Processing friend: ${JSON.stringify(user)}`);
      const watchlistItems = await getWatchlistIdsForUser(config, log, token, user);
      for (const item of watchlistItems) {
        const detailedItems = await toItems(config, log, item);
        detailedItems.forEach((detailedItem: Item) => allItems.add(detailedItem));
      }
    }
  } catch (err) {
    log.error(`Unable to fetch others' watchlist: ${err}`);
  }

  return allItems;
};

const toItems = async (config: PlexConfig, log: FastifyBaseLogger, item: TokenWatchlistItem): Promise<Set<Item>> => {
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

    const json = await response.json();
    const guids = json.MediaContainer.Metadata.flatMap((metadata: any) => metadata.Guid.map((guid: any) => guid.id));
    allItems.add({ title: item.title, key: item.id, type: item.type, guids });
  } catch (err) {
    log.error(`Unable to fetch item details for ${item.title}: ${err}`);
  }

  return allItems;
};