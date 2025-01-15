export const getOpenapiConfig = (port: number) => ({
	openapi: {
		info: {
			title: "Test swagger",
			description: "testing the fastify swagger api",
			version: "0.1.0",
		},
		servers: [
			{
				url: `http://localhost:${port}`,
			},
		],
		/*
      components: {
        securitySchemes: {
          apiKey: {
            type: 'apiKey',
            name: 'apiKey',
            in: 'header'
          }
        }
      },
      */
		tags: [
			{
				name: "Plex",
				description: "Plex related endpoints",
			},
		],
	},
	hideUntagged: true,
	exposeRoute: true,
});
