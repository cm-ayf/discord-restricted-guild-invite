import type {
	RESTOAuth2AuthorizationQuery,
	RESTPostOAuth2AccessTokenURLEncodedData,
	RESTPostOAuth2AccessTokenResult,
	RESTGetAPICurrentUserGuildsResult,
	RESTGetAPICurrentUserResult,
	RESTPutAPIGuildMemberJSONBody,
} from 'discord-api-types/v10';

export interface Env {
	DISCORD_CLIENT_ID: string;
	DISCORD_CLIENT_SECRET: string;
	DISCORD_TOKEN: string;
	DISCORD_MY_GUILD_ID: string;
	DISCORD_ENEMY_GUILD_IDS: string; // comma-separated
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method !== 'GET') {
			return new Response('method not allowed', { status: 405 });
		}

		const { pathname } = new URL(request.url);
		switch (pathname) {
			case '/':
				return Response.redirect('https://github.com/cm-ayf/discord-restricted-guild-invite');
			case '/authorize':
				return authorize(request, env);
			case '/callback':
				return callback(request, env);
			default:
				return new Response('route not found', { status: 404 });
		}
	},
};

async function authorize(request: Request, env: Env): Promise<Response> {
	const url = new URL('https://discord.com/oauth2/authorize');
	const searchParams = new URLSearchParams({
		client_id: env.DISCORD_CLIENT_ID,
		scope: 'identify guilds guilds.join',
		response_type: 'code',
		redirect_uri: new URL('/callback', request.url).toString(),
	} satisfies RESTOAuth2AuthorizationQuery);
	url.search = searchParams.toString();

	return Response.redirect(url.toString());
}

async function callback(request: Request, env: Env): Promise<Response> {
	let ENEMY_GUILDS = env.DISCORD_ENEMY_GUILD_IDS.split(',');

	const url = new URL(request.url);
	const code = url.searchParams.get('code');
	if (!code) return new Response('no code', { status: 400 });

	const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: new URLSearchParams({
			client_id: env.DISCORD_CLIENT_ID,
			client_secret: env.DISCORD_CLIENT_SECRET,
			grant_type: 'authorization_code',
			code,
			redirect_uri: new URL('/callback', request.url).toString(),
		} satisfies RESTPostOAuth2AccessTokenURLEncodedData),
	});
	const { access_token } = await tokenResponse.json<RESTPostOAuth2AccessTokenResult>();

	const userResponse = await fetch('https://discord.com/api/users/@me', {
		headers: { Authorization: `Bearer ${access_token}` },
	});
	const user = await userResponse.json<RESTGetAPICurrentUserResult>();

	const guildsResponse = await fetch('https://discord.com/api/users/@me/guilds', {
		headers: { Authorization: `Bearer ${access_token}` },
	});
	const guilds = await guildsResponse.json<RESTGetAPICurrentUserGuildsResult>();
	if (guilds.some((guild) => ENEMY_GUILDS.includes(guild.id))) {
		return new Response(':poop:', { status: 403 });
	}

	const joinResponse = await fetch(`https://discord.com/api/guilds/${env.DISCORD_MY_GUILD_ID}/members/${user.id}`, {
		method: 'PUT',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bot ${env.DISCORD_TOKEN}`,
		},
		body: JSON.stringify({ access_token } satisfies RESTPutAPIGuildMemberJSONBody),
	});
	if (!joinResponse.ok) {
		return new Response('join error', { status: 500 });
	}

	return Response.redirect(`https://discord.com/channels/${env.DISCORD_MY_GUILD_ID}`);
}
