import fs from 'fs';
import path from 'path';
import { FastifyBaseLogger } from 'fastify';

const configPath = path.resolve(__dirname, '../../config/config.json');

let config: any = null;

export const loadConfig = (logger: FastifyBaseLogger) => {
  logger.info('Loading configuration...');
  const rawConfig = fs.readFileSync(configPath, 'utf-8');
  config = JSON.parse(rawConfig);
  logger.info('Configuration loaded successfully.');
};

export const getConfig = (logger?: FastifyBaseLogger) => {
  if (!config) {
    if (logger) {
      logger.info('Configuration not found in memory. Reloading...');
      loadConfig(logger);
    }
  }
  return config;
};