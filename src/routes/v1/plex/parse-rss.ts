import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { rssWatchlistSchema } from "@schemas/plex/parse-rss-feeds.schema.js";

export const rssWatchlistRoute: FastifyPluginAsyncZod = async (
	fastify,
	_opts,
) => {
	fastify.route({
		method: "GET",
		url: "/rss-watchlist",
		schema: rssWatchlistSchema,
		handler: async (_request, reply) => {
			try {
				const response = await fastify.plexWatchlist.processRssWatchlists();
				reply.send(response);
			} catch (err) {
				fastify.log.error(err);
				reply
					.code(500)
					.send({ error: "Unable to fetch RSS watchlist items" });
			}
		},
	});
};