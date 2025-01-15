export interface User {
	id: string;
	username: string;
	email: string;
}

export interface Config {
	plexTokens: string[];
	port: number;
	selfRss?: string[];
	friendsRss?: string[];
}
