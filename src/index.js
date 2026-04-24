require("dotenv").config();
const fs = require("fs");
const path = require("path");
const {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
} = require("discord.js");
const pingCommand = require("./commands/ping");
const serverstatsCommand = require("./commands/serverstats");
const clearCommand = require("./commands/clear");
const muteCommand = require("./commands/mute");
const unmuteCommand = require("./commands/unmute");
const queryRecordCommand = require("./commands/queryRecord");
const messageDeleteLogger = require("./events/messageDeleteLogger");
const memberLogger = require("./events/memberLogger");
const voiceLogger = require("./events/voiceLogger");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const tokenPattern = /^[\w-]{24,}\.[\w-]{6,}\.[\w-]{20,}$/;
const snowflakePattern = /^\d{17,20}$/;
const lockFilePath = path.join(__dirname, "..", ".bot.lock");
const enableSingleInstanceLock = /^(1|true|yes|on)$/i.test(
  (process.env.ENABLE_SINGLE_INSTANCE_LOCK || "").trim()
);

let lockFd;

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "EPERM") {
      return true;
    }

    return false;
  }
}

function readLockOwnerPid() {
  try {
    const text = fs.readFileSync(lockFilePath, "utf8").trim();
    const pid = Number.parseInt(text, 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

function releaseSingleInstanceLock() {
  if (lockFd === undefined) {
    return;
  }

  try {
    fs.closeSync(lockFd);
  } catch {
    // Ignore lock close errors during shutdown.
  }

  lockFd = undefined;

  try {
    fs.unlinkSync(lockFilePath);
  } catch {
    // Ignore lock file removal errors during shutdown.
  }
}

function acquireSingleInstanceLock() {
  let retriedAfterCleanup = false;

  try {
    while (true) {
      try {
        lockFd = fs.openSync(lockFilePath, "wx");
        fs.writeFileSync(lockFd, String(process.pid));
        return;
      } catch (error) {
        if (error.code !== "EEXIST") {
          throw error;
        }

        const ownerPid = readLockOwnerPid();
        const lockIsStale = ownerPid === null || !isProcessAlive(ownerPid);

        if (lockIsStale && !retriedAfterCleanup) {
          retriedAfterCleanup = true;
          try {
            fs.unlinkSync(lockFilePath);
          } catch {
            // If removal fails, fallback to the normal EEXIST error path.
          }
          continue;
        }

        console.error(`Another bot instance is already running (PID: ${ownerPid ?? "unknown"}).`);
        process.exit(1);
      }
    }
  } catch (error) {
    throw error;
  }
}

if (enableSingleInstanceLock) {
  acquireSingleInstanceLock();
} else {
  console.log("Single instance lock is disabled. Set ENABLE_SINGLE_INSTANCE_LOCK=true to enable it.");
}

if (!token) {
  console.error("Missing DISCORD_TOKEN in .env file.");
  process.exit(1);
}

if (!tokenPattern.test(token)) {
  console.error("DISCORD_TOKEN format looks invalid. Paste a valid bot token from Discord Developer Portal.");
  process.exit(1);
}

const commands = [
  pingCommand,
  serverstatsCommand,
  clearCommand,
  muteCommand,
  unmuteCommand,
  queryRecordCommand,
];
const commandMap = new Map(commands.map((command) => [command.data.name, command]));
const slashCommands = commands.map((command) => command.data.toJSON());

async function registerGuildCommands() {
  if (!clientId) {
    console.warn("Skipping command registration. Set CLIENT_ID in .env.");
    return;
  }

  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationCommands(clientId), {
    body: slashCommands,
  });
  console.log("Global slash commands registered.");

  if (!clientId || !guildId) {
    console.warn("Skipping slash command registration. Set CLIENT_ID and GUILD_ID in .env to auto-register commands.");
    return;
  }

  if (!snowflakePattern.test(clientId) || !snowflakePattern.test(guildId)) {
    console.warn("Skipping slash command registration. CLIENT_ID and GUILD_ID must be numeric snowflake IDs.");
    return;
  }

  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: slashCommands,
  });
  console.log("Guild slash commands registered for the test guild.");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.User],
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);

  try {
    await registerGuildCommands();
  } catch (error) {
    console.error("Failed to register slash commands:", error.message);
  }
});

client.on(Events.Error, (error) => {
  console.error("Discord client error:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

process.on("exit", () => {
  releaseSingleInstanceLock();
});

process.on("SIGINT", () => {
  releaseSingleInstanceLock();
  process.exit(0);
});

process.on("SIGTERM", () => {
  releaseSingleInstanceLock();
  process.exit(0);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isButton()) {
      const handler = commands.find(
        (command) =>
          typeof command.canHandleComponent === "function" &&
          command.canHandleComponent(interaction.customId)
      );

      if (!handler || typeof handler.handleComponent !== "function") {
        return;
      }

      await handler.handleComponent(interaction, client);
      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = commandMap.get(interaction.commandName);
    if (!command) {
      await interaction.reply({ content: "Unknown command.", ephemeral: true });
      return;
    }

    await command.execute(interaction, client);
  } catch (error) {
    console.error("Interaction error:", error);

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: "Command failed. Please try again.", embeds: [] }).catch(() => {});
      return;
    }

    await interaction.reply({ content: "Command failed. Please try again.", ephemeral: true }).catch(() => {});
  }
});

client.on(Events.MessageDelete, async (message) => {
  try {
    await messageDeleteLogger.execute(message, client);
  } catch (error) {
    console.error("MessageDelete logger error:", error);
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    await memberLogger.onMemberAdd(member, client);
  } catch (error) {
    console.error("GuildMemberAdd logger error:", error);
  }
});

client.on(Events.GuildMemberRemove, async (member) => {
  try {
    await memberLogger.onMemberRemove(member, client);
  } catch (error) {
    console.error("GuildMemberRemove logger error:", error);
  }
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  try {
    await voiceLogger.onVoiceStateUpdate(oldState, newState, client);
  } catch (error) {
    console.error("VoiceStateUpdate logger error:", error);
  }
});

client.login(token).catch((error) => {
  if (error.code === "TokenInvalid") {
    console.error("Discord rejected DISCORD_TOKEN. Generate or copy the correct bot token, then restart the app.");
    return;
  }

  console.error("Failed to login to Discord:", error.message);
});
