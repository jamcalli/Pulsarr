export interface PlexResponse {
	MediaContainer: {
		Metadata: Array<{
			title: string;
			key: string;
			type: string;
			thumb: string;
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

export interface Item {
	title: string;
	key: string;
	type: string;
	thumb?: string;
	guids?: string[] | string;
	genres?: string[] | string;
	user?: string;
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

export interface TokenWatchlistItem extends Item {
	id: string;
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
			thumb?: string;
		}>;
	};
	errors?: any;
	data?: {
		allFriendsV2?: Array<{ user: { id: string; username: string } }>;
		user?: {
			watchlist?: {
				nodes: Array<TokenWatchlistItem>;
				pageInfo: {
					hasNextPage: boolean;
					endCursor: string;
				};
			};
		};
	};
	RSSInfo?: Array<{ url: string }>;
}

export interface RssWatchlistItem {
	title: string;
	pubDate: string;
	link: string;
	guids: string[];
	description: string;
	category: string;
	credits: Array<{
		credit: string;
		role: string;
	}>;
	thumbnail?: {
		url: string;
	};
	keywords?: string[];
}

export interface RssResponse {
	title: string;
	links: {
		self: string;
		next?: string;
	};
	description: string;
	items: RssWatchlistItem[];
}
