export interface User {
	id?: number; 
	name: string;
	email: string;
	discord_id?: string;
	notify_email: boolean;
	notify_discord: boolean;
	can_sync: boolean;
	created_at?: string;  
	updated_at?: string; 
  }
  
  export interface Config {
	id?: number;  
	plexTokens: string[];
	port?: number;
	selfRss?: string;
	friendsRss?: string;
	created_at?: string; 
	updated_at?: string;
  }