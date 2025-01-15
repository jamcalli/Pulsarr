import { build } from "./app.js";
import { getConfig } from "@shared/config/config-manager.js";

const server = build();
const config = getConfig(server.log);

server.listen({ port: config.port, host: "127.0.0.1" }, (err, address) => {
	if (err) {
		server.log.error(err);
		process.exit(1);
	}
});
