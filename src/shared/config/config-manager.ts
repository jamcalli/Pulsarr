import type { FastifyBaseLogger } from "fastify";
import { getDbInstance } from "@db/db.js";

let config: any = null;

export const loadConfig = (logger: FastifyBaseLogger) => {
	logger.info("Loading configuration...");
	const db = getDbInstance(logger);
	const configFromDb = db.getConfig(1);
	if (configFromDb) {
		config = configFromDb;
		logger.info("Configuration loaded successfully from database.");
	} else {
		logger.error("Failed to load configuration from database.");
	}
};

export const getConfig = (logger?: FastifyBaseLogger) => {
	if (!config) {
		if (logger) {
			logger.info("Configuration not found in memory. Reloading...");
			loadConfig(logger);
		}
	}
	return config;
};
