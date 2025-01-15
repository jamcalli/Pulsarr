import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

export function getDirname(importMetaUrl: string) {
	return dirname(fileURLToPath(importMetaUrl));
}
