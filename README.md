# Discord.js Bot Starter

A minimal Discord bot starter built with discord.js.

## 1. Prerequisites

- Node.js 20+
- A Discord application and bot token

## 2. Setup

```bash
npm install
```

Copy `.env.example` to `.env`, then fill in your values:

```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_application_client_id
GUILD_ID=your_test_guild_id
HENRIK_API_KEY=your_henrik_api_key
```

## 3. Run

Development (auto-reload):

```bash
npm run dev
```

Production:

```bash
npm start
```

## 4. Register slash commands (next step)

This starter auto-registers guild slash commands on startup when `CLIENT_ID` and `GUILD_ID` are set.

Available commands:

- `/ping` replies with `Pong!`
- `/serverstats` shows `Online / Total` members in the current server
- `/查詢戰績` queries Valorant stats via Henrik unofficial API

`/查詢戰績` input format:

- `玩家` must be Riot ID format: `Name#Tag`
- Example: `TenZ#NA1`
- `地區` options: `AP`, `EU`, `NA`, `KR`, `LATAM`, `BR`

`/查詢戰績` output:

- Uses `V26 A2` season data starting from `2026/03/18`
- Includes mode buttons in the embed: `Competitive` and `Unrated`
- Displays 6 metrics for selected mode:
	1. Headshot Rate
	2. K/D
	3. ACS
	4. Win Rate
	5. ADR (Damage/Round)
	6. KAST %

For accurate online counts, enable these privileged intents in Discord Developer Portal for your bot:

- Server Members Intent
- Presence Intent
