export interface PlexConfig {
  plexTokens: string[];
}

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

export interface Item {
  title: string;
  key: string;
  type: string;
  guids: string[];
  genres: string[];
}

export interface User {
  id: string;
  username: string;
}

export interface TokenWatchlistItem {
  id: string;
  title: string;
  type: string;
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
        nodes: TokenWatchlistItem[];
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