import type { FastifyRequest } from 'fastify';
import type { PinoLoggerOptions } from 'fastify/types/logger.js';

export const loggerConfig: PinoLoggerOptions = {
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
      ignore: 'pid,hostname',
      messageFormat: '{msg} {if reqId}{reqId} {end}{if req.method}{req.method} {end}{if req.url}{req.url}{end}{if responseTime}{responseTime}ms{end}',
      singleLine: true,
      customTimestamp: true,
      customLevels: undefined,
      useOnlyCustomProps: true
    }
  },
  serializers: {
    req: (req: FastifyRequest) => ({
      method: req.method,
      url: req.url,
      remoteAddress: req.ip
    }),
    res: (res) => ({
      statusCode: res.statusCode
    })
  }
};