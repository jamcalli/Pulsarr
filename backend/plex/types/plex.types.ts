export interface PlexResponse {
  MediaContainer: {
    Metadata: Array<{
      title: string;
      key: string;
      type: string;
      Guid?: Array<{ id: string }>;
      Genre?: Array<{ tag: string }>;
    }>;
    totalSize: number;
  };
}

export interface Friend {
  watchlistId: string;
  username: string;
}

export interface RssWatchlistResponse {
  items: Array<{
    title: string;
    key?: string;
    type: string;
    guids: string[];
    genres: string[];
  }>;
}

export interface Item {
  title: string;
  key?: string;
  type: string;
  guids?: string[];
  genres?: string[];
  thumbnail?: string;
  user?: string;
}

export interface GraphQLError {
  message: string;
  extensions?: {
    code?: string;
    field?: string;
    context?: Array<{
      arg?: string;
      value?: string;
    }>;
  };
}

export interface TokenWatchlistFriend {
  data?: {
    user?: {
      watchlist: {
        nodes: Item[];
        pageInfo: {
          hasNextPage: boolean;
          endCursor: string;
        };
      };
    };
  };
  errors?: GraphQLError[];
}

export interface GraphQLQuery {
  query: string;
  variables?: Record<string, any>;
}

export interface RssFeedGenerated {
  RSSInfo: {
    [0]: {
      url: string;
    };
  };
}

export interface PlexApiResponse {
  MediaContainer?: {
    Metadata?: Array<{
      Guid?: Array<{ id: string }>;
      Genre?: Array<{ tag: string }>;
    }>;
  };
  errors?: any;
  data?: {
    allFriendsV2?: Array<{ user: { id: string; username: string } }>;
    user?: {
      watchlist?: {
        nodes: Array<Item>;
        pageInfo: {
          hasNextPage: boolean;
          endCursor: string;
        };
      };
    };
  };
  RSSInfo?: Array<{ url: string }>;
}