import type { FastifyBaseLogger } from "fastify";
import {
	getOthersWatchlist,
	processWatchlistItems,
	getFriends,
	pingPlex,
	fetchSelfWatchlist,
} from "@plex/utils/plex.js";
import { getDbInstance } from "@db/db.js";
import { getConfig } from "@shared/config/config-manager.js";
import type { Config } from "@shared/types/config.types.js";
import type {
	Item as WatchlistItem,
	TokenWatchlistItem,
	Friend,
} from "@plex/types/plex.types.js";

export class PlexWatchlistService {
	private readonly log: FastifyBaseLogger;
	private readonly db: ReturnType<typeof getDbInstance>;
	private config: Config;

	constructor(log: FastifyBaseLogger) {
		this.log = log;
		this.db = getDbInstance(log);
		this.config = getConfig(log) || {};
	}

	private ensureConfig() {
		if (!this.config || Object.keys(this.config).length === 0) {
			this.log.info("Reloading configuration...");
			this.config = getConfig(this.log) || {};
		}
	}

	async pingPlex(): Promise<boolean> {
		this.ensureConfig();
		const tokens = this.config.plexTokens || [];

		if (tokens.length === 0) {
			throw new Error("No Plex tokens configured");
		}

		await Promise.all(tokens.map((token) => pingPlex(token, this.log)));
		return true;
	}

	async getOthersWatchlists() {
		this.ensureConfig();

		if (!this.config.plexTokens || this.config.plexTokens.length === 0) {
			throw new Error("No Plex token configured");
		}

		const friends = await getFriends(this.config, this.log);
		const userWatchlistMap = await getOthersWatchlist(
			this.config,
			this.log,
			friends,
		);

		if (userWatchlistMap.size === 0) {
			throw new Error("Unable to fetch others' watchlist items");
		}

		const { allKeys, userKeyMap } =
			this.extractKeysAndRelationships(userWatchlistMap);
		const existingItems = this.getExistingItems(userKeyMap, allKeys);
		const { brandNewItems, existingItemsToLink } = this.categorizeItems(
			userWatchlistMap,
			existingItems,
		);

		const processedItems = await this.processAndSaveNewItems(brandNewItems);
		this.linkExistingItems(existingItemsToLink);

		return this.buildResponse(
			userWatchlistMap,
			existingItems,
			existingItemsToLink,
			processedItems,
		);
	}

	async getSelfWatchlist() {
		this.ensureConfig();

		if (!this.config.plexTokens || this.config.plexTokens.length === 0) {
			throw new Error("No Plex token configured");
		}

		const userWatchlistMap = new Map<Friend, Set<TokenWatchlistItem>>();

		await Promise.all(
			this.config.plexTokens.map(async (token, index) => {
				const tokenConfig = { ...this.config, plexTokens: [token] };
				const items = await fetchSelfWatchlist(tokenConfig, this.log);

				if (items.size > 0) {
					const tokenUser: Friend = {
						watchlistId: `token${index + 1}`,
						username: `token${index + 1}`,
					};
					userWatchlistMap.set(tokenUser, items);
				}
			}),
		);

		if (userWatchlistMap.size === 0) {
			throw new Error("Unable to fetch watchlist items");
		}

		const { allKeys, userKeyMap } =
			this.extractKeysAndRelationships(userWatchlistMap);
		const existingItems = this.getExistingItems(userKeyMap, allKeys);
		const { brandNewItems, existingItemsToLink } = this.categorizeItems(
			userWatchlistMap,
			existingItems,
		);

		const processedItems = await this.processAndSaveNewItems(brandNewItems);
		this.linkExistingItems(existingItemsToLink);

		return this.buildResponse(
			userWatchlistMap,
			existingItems,
			existingItemsToLink,
			processedItems,
		);
	}

	private extractKeysAndRelationships(
		userWatchlistMap: Map<Friend, Set<TokenWatchlistItem>>,
	) {
		const allKeys = new Set<string>();
		const userKeyMap = new Map<string, Set<string>>();

		userWatchlistMap.forEach((items: Set<TokenWatchlistItem>, user: Friend) => {
			const userKeys = new Set<string>();
			items.forEach((item) => {
				allKeys.add(item.id);
				userKeys.add(item.id);
			});
			userKeyMap.set(user.watchlistId, userKeys);
		});

		this.log.info(
			`Collected ${userKeyMap.size} users and ${allKeys.size} unique keys`,
		);
		return { allKeys, userKeyMap };
	}

	private getExistingItems(
		userKeyMap: Map<string, Set<string>>,
		allKeys: Set<string>,
	) {
		const allUsers = Array.from(userKeyMap.keys());
		const existingItems = this.db.getBulkWatchlistItems(
			allUsers,
			Array.from(allKeys),
		);
		this.log.info(`Found ${existingItems.length} existing items in database`);

		const existingItemsByKey = new Map<string, Map<string, WatchlistItem>>();
		existingItems.forEach((item) => {
			if (item.user && item.key) {
				if (!existingItemsByKey.has(item.key)) {
					existingItemsByKey.set(item.key, new Map());
				}
				existingItemsByKey.get(item.key)!.set(item.user, item);
			}
		});

		return existingItems;
	}

	private categorizeItems(
		userWatchlistMap: Map<Friend, Set<TokenWatchlistItem>>,
		existingItems: WatchlistItem[],
	) {
		const brandNewItems = new Map<Friend, Set<TokenWatchlistItem>>();
		const existingItemsToLink = new Map<Friend, Set<WatchlistItem>>();
		const existingItemsByKey = this.mapExistingItemsByKey(existingItems);

		userWatchlistMap.forEach((items, user) => {
			const { newItems, itemsToLink } = this.separateNewAndExistingItems(
				items,
				user,
				existingItemsByKey,
			);

			if (newItems.size > 0) brandNewItems.set(user, newItems);
			if (itemsToLink.size > 0) existingItemsToLink.set(user, itemsToLink);
		});

		return { brandNewItems, existingItemsToLink };
	}

	private async processAndSaveNewItems(
		brandNewItems: Map<Friend, Set<TokenWatchlistItem>>,
	): Promise<Map<Friend, Set<WatchlistItem>>> {
		if (brandNewItems.size === 0) return new Map<Friend, Set<WatchlistItem>>();

		const processedItems = await processWatchlistItems(
			this.config,
			this.log,
			brandNewItems,
		);

		if (processedItems instanceof Map) {
			const itemsToInsert = this.prepareItemsForInsertion(processedItems);

			if (itemsToInsert.length > 0) {
				this.db.createWatchlistItems(itemsToInsert);
				this.log.info(
					`Processed and inserted ${itemsToInsert.length} new items`,
				);
			}

			return processedItems;
		} else {
			throw new Error(
				"Expected Map<Friend, Set<WatchlistItem>> from processWatchlistItems",
			);
		}
	}

	private linkExistingItems(
		existingItemsToLink: Map<Friend, Set<WatchlistItem>>,
	) {
		const linkItems = Array.from(existingItemsToLink.values()).flatMap(
			(items) => Array.from(items),
		);

		if (linkItems.length > 0) {
			this.db.createWatchlistItems(linkItems);
			this.log.info(`Linked ${linkItems.length} existing items to new users`);
		}
	}

	private buildResponse(
		userWatchlistMap: Map<Friend, Set<TokenWatchlistItem>>,
		existingItems: WatchlistItem[],
		existingItemsToLink: Map<Friend, Set<WatchlistItem>>,
		processedItems: Map<Friend, Set<WatchlistItem>>,
	) {
		return {
			total: this.calculateTotal(
				existingItems,
				existingItemsToLink,
				processedItems,
			),
			users: this.buildUserWatchlists(
				userWatchlistMap,
				existingItems,
				existingItemsToLink,
				processedItems,
			),
		};
	}

	private mapExistingItemsByKey(existingItems: WatchlistItem[]) {
		const map = new Map<string, Map<string, WatchlistItem>>();
		existingItems.forEach((item) => {
			if (item.user && item.key) {
				if (!map.has(item.key)) {
					map.set(item.key, new Map());
				}
				map.get(item.key)!.set(item.user, item);
			}
		});
		return map;
	}

	private separateNewAndExistingItems(
		items: Set<TokenWatchlistItem>,
		user: Friend,
		existingItemsByKey: Map<string, Map<string, WatchlistItem>>,
	) {
		const newItems = new Set<TokenWatchlistItem>();
		const itemsToLink = new Set<WatchlistItem>();

		items.forEach((item) => {
			const existingItem = existingItemsByKey.get(item.id);
			if (!existingItem) {
				newItems.add(item);
			} else if (!existingItem.has(user.watchlistId)) {
				const templateItem = existingItem.values().next().value;
				if (templateItem?.title && templateItem?.type) {
					itemsToLink.add(this.createWatchlistItem(user, item, templateItem));
				}
			}
		});

		return { newItems, itemsToLink };
	}

	private createWatchlistItem(
		user: Friend,
		item: TokenWatchlistItem,
		templateItem: WatchlistItem,
	): WatchlistItem {
		return {
			user: user.watchlistId,
			title: templateItem.title,
			key: item.id,
			type: templateItem.type,
			thumb: templateItem.thumb,
			guids: templateItem.guids || [],
			genres: templateItem.genres || [],
		};
	}

	private prepareItemsForInsertion(
		processedItems: Map<Friend, Set<WatchlistItem>>,
	) {
		return Array.from(processedItems.entries()).flatMap(([user, items]) =>
			Array.from(items).map((item) => ({
				user: user.watchlistId,
				title: item.title,
				key: item.key,
				thumb: item.thumb,
				type: item.type,
				guids: item.guids || [],
				genres: item.genres || [],
			})),
		);
	}

	private calculateTotal(
		existingItems: WatchlistItem[],
		existingItemsToLink: Map<Friend, Set<WatchlistItem>>,
		processedItems: Map<Friend, Set<WatchlistItem>>,
	) {
		const linkItemsCount = Array.from(existingItemsToLink.values()).reduce(
			(acc, items) => acc + items.size,
			0,
		);
		const processedItemsCount = Array.from(processedItems.values()).reduce(
			(acc, items) => acc + items.size,
			0,
		);

		return existingItems.length + linkItemsCount + processedItemsCount;
	}

	private buildUserWatchlists(
		userWatchlistMap: Map<Friend, Set<TokenWatchlistItem>>,
		existingItems: WatchlistItem[],
		existingItemsToLink: Map<Friend, Set<WatchlistItem>>,
		processedItems: Map<Friend, Set<WatchlistItem>>,
	) {
		return Array.from(userWatchlistMap.keys()).map((user) => ({
			user: {
				watchlistId: user.watchlistId,
				username: user.username,
			},
			watchlist: [
				...this.formatExistingItems(existingItems, user),
				...this.formatLinkedItems(existingItemsToLink, user),
				...this.formatProcessedItems(processedItems, user),
			],
		}));
	}

	private formatExistingItems(existingItems: WatchlistItem[], user: Friend) {
		return existingItems
			.filter((item) => item.user === user.watchlistId)
			.map(this.formatWatchlistItem);
	}

	private formatLinkedItems(
		existingItemsToLink: Map<Friend, Set<WatchlistItem>>,
		user: Friend,
	) {
		return existingItemsToLink.has(user)
			? Array.from(existingItemsToLink.get(user)!).map(this.formatWatchlistItem)
			: [];
	}

	private formatProcessedItems(
		processedItems: Map<Friend, Set<WatchlistItem>>,
		user: Friend,
	) {
		return processedItems.has(user)
			? Array.from(processedItems.get(user)!).map(this.formatWatchlistItem)
			: [];
	}

	private formatWatchlistItem(item: WatchlistItem) {
		return {
			title: item.title,
			plexKey: item.key,
			type: item.type,
			thumb: item.thumb || "",
			guids:
				typeof item.guids === "string"
					? JSON.parse(item.guids)
					: item.guids || [],
			genres:
				typeof item.genres === "string"
					? JSON.parse(item.genres)
					: item.genres || [],
		};
	}
}
