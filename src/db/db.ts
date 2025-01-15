import Database from "better-sqlite3";
import type { Database as DatabaseType, Statement } from "better-sqlite3";
import type { FastifyBaseLogger } from "fastify";
import { join } from "path";
import dotenv from "dotenv";
import type { Item as WatchlistItem } from "@plex/types/plex.types.js";
import type { Config, User } from "@shared/types/config.types.js";
import { getDirname } from "@utils/paths.js";

const currentDir = getDirname(import.meta.url);
const projectRoot = join(currentDir, "../../");
const dbDir = join(projectRoot, "data", "db");
const envPath = join(projectRoot, ".env");

dotenv.config({ path: envPath });

interface DatabaseOperations {
	getUser(id: number): User | undefined;
	createUser(user: Omit<User, "id" | "created_at">): number;
	updateUser(
		id: number,
		data: Partial<Omit<User, "id" | "created_at">>,
	): boolean;
	getConfig(id: number): Config | undefined;
	createConfig(config: Config): number;
	updateConfig(id: number, config: Partial<Config>): boolean;
	getWatchlistItem(user: string, key: string): WatchlistItem | undefined;
	getBulkWatchlistItems(userIds: string[], keys: string[]): WatchlistItem[];
	createWatchlistItems(items: WatchlistItem[]): void;
}

class DatabaseConnection implements DatabaseOperations {
	private static instance: DatabaseConnection;
	private db: DatabaseType;
	private statements: {
		getUser: Statement<[number]>;
		createUser: Statement<[string, string]>;
		updateUser: Statement;
		getConfig: Statement<[number]>;
		createConfig: Statement<
			[string, number, string | undefined, string | undefined]
		>;
		updateConfig: Statement<
			[
				string | undefined,
				number | undefined,
				string | undefined,
				string | undefined,
				number,
			]
		>;
		getWatchlistItem: Statement<[string, string]>;
		createWatchlistItem: Statement<
			[string, string, string, string, string, string]
		>;
		getBulkWatchlistItems: Statement<[string[], string[]]>;
	};

	private constructor(private logger: FastifyBaseLogger) {
		const verboseLogger = (message?: unknown, ...additionalArgs: unknown[]) => {
			if (
				message &&
				typeof message === "string" &&
				message.startsWith("Error:")
			) {
				this.logger.error(message, ...additionalArgs);
			}
		};

		const dbPath = join(dbDir, "plexwatchlist.db");

		this.db = new Database(dbPath, {
			verbose: verboseLogger,
		});

		// Create tables if they don't exist
		this.db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plexTokens TEXT NOT NULL,
                port INTEGER NOT NULL,
                selfRss TEXT,
                friendsRss TEXT
            );
            CREATE TABLE IF NOT EXISTS watchlist_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user TEXT NOT NULL,
                title TEXT NOT NULL,
                key TEXT NOT NULL,
                type TEXT NOT NULL,
                thumb TEXT,
                guids TEXT,
                genres TEXT,
                UNIQUE(user, key)
            );
        `);

		// Initialize prepared statements
		this.statements = {
			getUser: this.db.prepare("SELECT * FROM users WHERE id = ?"),
			createUser: this.db.prepare(
				"INSERT INTO users (name, email) VALUES (?, ?)",
			),
			updateUser: this.db.prepare(
				"UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email) WHERE id = ?",
			),
			getConfig: this.db.prepare("SELECT * FROM configs WHERE id = ?"),
			createConfig: this.db.prepare(
				"INSERT INTO configs (plexTokens, port, selfRss, friendsRss) VALUES (?, ?, ?, ?)",
			),
			updateConfig: this.db.prepare(
				"UPDATE configs SET plexTokens = COALESCE(?, plexTokens), port = COALESCE(?, port), selfRss = COALESCE(?, selfRss), friendsRss = COALESCE(?, friendsRss) WHERE id = ?",
			),
			getWatchlistItem: this.db.prepare(
				"SELECT * FROM watchlist_items WHERE user = ? AND key = ?",
			),
			createWatchlistItem: this.db.prepare(
				"INSERT INTO watchlist_items (user, title, key, type, thumb, guids, genres) VALUES (?, ?, ?, ?, ?, ?, ?)",
			),
			getBulkWatchlistItems: this.db.prepare(`
                SELECT * FROM watchlist_items 
                WHERE user IN (${Array(20).fill("?").join(",")})
                AND key IN (${Array(20).fill("?").join(",")})
            `),
		};

		// Set pragmas for better performance
		this.db.pragma("journal_mode = WAL");
		this.db.pragma("synchronous = NORMAL");

		// Handle process termination
		process.on("exit", () => this.closeConnection());
		process.on("SIGHUP", () => process.exit(128 + 1));
		process.on("SIGINT", () => process.exit(128 + 2));
		process.on("SIGTERM", () => process.exit(128 + 15));

		// Migrate existing config from .env to database
		this.migrateConfigFromEnv();
	}

	public static getInstance(logger: FastifyBaseLogger): DatabaseConnection {
		if (!DatabaseConnection.instance) {
			DatabaseConnection.instance = new DatabaseConnection(logger);
		}
		return DatabaseConnection.instance;
	}

	public getUser(id: number): User | undefined {
		return this.statements.getUser.get(id) as User | undefined;
	}

	public createUser(user: Omit<User, "id" | "created_at">): number {
		const result = this.statements.createUser.run(user.username, user.email);
		return result.lastInsertRowid as number;
	}

	public updateUser(
		id: number,
		data: Partial<Omit<User, "id" | "created_at">>,
	): boolean {
		const result = this.statements.updateUser.run(
			data.username,
			data.email,
			id,
		);
		return result.changes > 0;
	}

	public getConfig(id: number): Config | undefined {
		const row = this.statements.getConfig.get(id) as
			| {
					plexTokens: string;
					port: number;
					selfRss?: string;
					friendsRss?: string;
			  }
			| undefined;
		if (row) {
			return {
				plexTokens: JSON.parse(row.plexTokens),
				port: row.port,
				selfRss: row.selfRss ? JSON.parse(row.selfRss) : undefined,
				friendsRss: row.friendsRss ? JSON.parse(row.friendsRss) : undefined,
			};
		}
		return undefined;
	}

	public createConfig(config: Config): number {
		const result = this.statements.createConfig.run(
			JSON.stringify(config.plexTokens),
			config.port,
			config.selfRss ? JSON.stringify(config.selfRss) : undefined,
			config.friendsRss ? JSON.stringify(config.friendsRss) : undefined,
		);
		this.logger.info(`Config created with ID: ${result.lastInsertRowid}`);
		return result.lastInsertRowid as number;
	}

	public updateConfig(id: number, config: Partial<Config>): boolean {
		const result = this.statements.updateConfig.run(
			config.plexTokens ? JSON.stringify(config.plexTokens) : undefined,
			config.port,
			config.selfRss ? JSON.stringify(config.selfRss) : undefined,
			config.friendsRss ? JSON.stringify(config.friendsRss) : undefined,
			id,
		);
		return result.changes > 0;
	}

	public getWatchlistItem(
		user: string,
		key: string,
	): WatchlistItem | undefined {
		return this.statements.getWatchlistItem.get(user, key) as
			| WatchlistItem
			| undefined;
	}

	public getBulkWatchlistItems(
		userIds: string[],
		keys: string[],
	): WatchlistItem[] {
		this.logger.info(
			`Checking for existing items with ${userIds.length} users and ${keys.length} keys`,
		);

		if (keys.length === 0) {
			return [];
		}

		// Create chunks of 100 items to avoid SQL query length limits
		const chunkSize = 100;
		const keyChunks = [];
		for (let i = 0; i < keys.length; i += chunkSize) {
			keyChunks.push(keys.slice(i, i + chunkSize));
		}

		const userChunks = [];
		if (userIds.length > 0) {
			for (let i = 0; i < userIds.length; i += chunkSize) {
				userChunks.push(userIds.slice(i, i + chunkSize));
			}
		}

		const allResults: WatchlistItem[] = [];

		// Process each chunk
		for (const keyChunk of keyChunks) {
			if (userChunks.length > 0) {
				for (const userChunk of userChunks) {
					const sql = `
                        SELECT * FROM watchlist_items 
                        WHERE key IN (${keyChunk.map(() => "?").join(",")})
                        AND user IN (${userChunk.map(() => "?").join(",")})
                    `;

					try {
						const stmt = this.db.prepare(sql);
						const params = [...keyChunk, ...userChunk];
						const results = stmt.all(params) as WatchlistItem[];
						allResults.push(...results);
					} catch (err) {
						this.logger.error(
							`Error executing bulk watchlist query chunk: ${err}`,
						);
					}
				}
			} else {
				// If no users specified, just check keys
				const sql = `
                    SELECT * FROM watchlist_items 
                    WHERE key IN (${keyChunk.map(() => "?").join(",")})
                `;

				try {
					const stmt = this.db.prepare(sql);
					const results = stmt.all(keyChunk) as WatchlistItem[];
					allResults.push(...results);
				} catch (err) {
					this.logger.error(
						`Error executing bulk watchlist query chunk: ${err}`,
					);
				}
			}
		}

		this.logger.info(
			`Query returned ${allResults.length} total matches from database`,
		);
		return allResults;
	}

	public createWatchlistItems(items: WatchlistItem[]): void {
		const insertStatement = this.db.prepare(`
            INSERT OR IGNORE INTO watchlist_items (user, title, key, type, thumb, guids, genres)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

		this.runTransaction(() => {
			for (const item of items) {
				insertStatement.run(
					item.user,
					item.title,
					item.key,
					item.type,
					item.thumb,
					JSON.stringify(item.guids),
					JSON.stringify(item.genres),
				);
			}
		});
	}

	public runTransaction<T>(fn: (db: DatabaseType) => T): T {
		const transaction = this.db.transaction(fn);
		return transaction(this.db);
	}

	private closeConnection(): void {
		if (this.db) {
			this.db.close();
		}
	}

	// Getter for direct database access when needed
	public get database(): DatabaseType {
		return this.db;
	}

	private migrateConfigFromEnv(): void {
		if (!process.env.PLEX_TOKENS || !process.env.PORT) {
			this.logger.error("Missing PLEX_TOKENS or PORT in .env file.");
			process.exit(1);
		}

		const existingConfig = this.getConfig(1);
		if (existingConfig) {
			this.logger.info("Configuration already exists in the database.");
			return;
		}

		const plexTokens = JSON.parse(process.env.PLEX_TOKENS);
		const port = Number.parseInt(process.env.PORT, 10);
		const config: Config = { plexTokens, port };
		this.createConfig(config);
		this.logger.info("Configuration migrated from .env to database.");
	}
}

// Export a function to get the singleton instance
export const getDbInstance = (
	logger: FastifyBaseLogger,
): DatabaseConnection => {
	return DatabaseConnection.getInstance(logger);
};
