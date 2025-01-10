const token = 'nWBHV2vVJNF2uH_uhsVk';

  export const getFriends = async (token) => {
    const allFriends = new Set();
  
    const url = new URL('https://community.plex.tv/api');
    const query = {
      query: `query GetAllFriends {
        allFriendsV2 {
          user {
            username
            id
          }
        }
      }`
    };
  
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
        console.warn(`Unable to fetch friends from Plex: ${response.statusText}`);
        return allFriends;
      }
  
      const json = await response.json();
      if (json.errors) {
        console.warn(`GraphQL errors: ${JSON.stringify(json.errors)}`);
        return allFriends;
      }
  
      const friends = json.data.allFriendsV2.map((friend) => 
        [friend.user, token]
      );
      
      if (friends.length === 0) {
        console.warn(`No friends found for token: ${token}`);
        return allFriends;
      }
  
      friends.forEach((friend) => {
        allFriends.add(friend);
      });
    } catch (err) {
      console.warn(`Unable to fetch friends from Plex: ${err}`);
    }
    
    console.log("All friends fetched successfully:", Array.from(allFriends));
    return allFriends;
  };

//getFriends(token);

export const getPlexWatchlistUrls = async (
  tokens,
  skipFriendSync,
  log
) => {
  const watchlistsFromTokenIo = await Promise.all(
    Array.from(tokens).map(async (token) => {
      const selfWatchlist = await getRssFromPlexToken(token, 'watchlist', log);
      log.info(`Generated watchlist RSS feed for self: ${selfWatchlist}`);
      const friendsWatchlist = skipFriendSync ? null : await getRssFromPlexToken(token, 'friendsWatchlist', log);
      log.info(`Generated watchlist RSS feed for friends: ${friendsWatchlist}`);
      return [selfWatchlist, friendsWatchlist].filter(Boolean);
    })
  );

  const watchlistsFromToken = new Set(watchlistsFromTokenIo.flat());

  if (watchlistsFromToken.size === 0) {
    log.warn('Missing RSS URL. Are you an active Plex Pass user?');
    log.warn('Real-time RSS sync disabled');
  }

  return watchlistsFromToken;
};

export const getRssFromPlexToken = async (
  token,
  rssType,
  log
) => {
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

    const json = await response.json();
    log.debug('Got a result from Plex when generating RSS feed, attempting to decode');
    const rssFeedGenerated = json;
    return rssFeedGenerated.RSSInfo[0]?.url || null;
  } catch (err) {
    log.warn(`Unable to generate an RSS feed: ${err}`);
    return null;
  }
};

const tokens = new Set(['nWBHV2vVJNF2uH_uhsVk']);
const skipFriendSync = false;
const log = console;

getPlexWatchlistUrls(tokens, skipFriendSync, log).then((urls) => {
  console.log('Generated RSS URLs:', urls);
});