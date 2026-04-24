const { EmbedBuilder, PermissionsBitField } = require("discord.js");

const processedDeletes = new Map();
const DELETE_DEDUP_WINDOW_MS = 15_000;

function isDuplicateDelete(messageId) {
  if (!messageId) {
    return false;
  }

  const now = Date.now();

  for (const [id, timestamp] of processedDeletes) {
    if (now - timestamp > DELETE_DEDUP_WINDOW_MS) {
      processedDeletes.delete(id);
    }
  }

  const previous = processedDeletes.get(messageId);
  if (previous && now - previous <= DELETE_DEDUP_WINDOW_MS) {
    return true;
  }

  processedDeletes.set(messageId, now);
  return false;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Taipei",
  }).format(date).replace(/\//g, "/");
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function truncate(text, max) {
  if (!text) {
    return "無";
  }

  if (text.length <= max) {
    return text;
  }

  return `${text.slice(0, max - 3)}...`;
}

async function resolveMember(message) {
  if (!message.guild || !message.author) {
    return null;
  }

  if (message.member) {
    return message.member;
  }

  try {
    return await message.guild.members.fetch(message.author.id);
  } catch {
    return null;
  }
}

async function resolveLogChannel(message) {
  const configuredChannelId = process.env.MESSAGE_DELETE_LOG_CHANNEL_ID;

  if (configuredChannelId && message.guild) {
    try {
      const configuredChannel =
        message.guild.channels.cache.get(configuredChannelId) ||
        await message.guild.channels.fetch(configuredChannelId);
      if (configuredChannel && configuredChannel.isTextBased()) {
        return configuredChannel;
      }
    } catch {
      return null;
    }
  }

  if (message.channel && message.channel.isTextBased()) {
    return message.channel;
  }

  return null;
}

module.exports = {
  async execute(message, client) {
    if (!message.guild) {
      return;
    }

    if (isDuplicateDelete(message.id)) {
      return;
    }

    if (message.partial) {
      try {
        await message.fetch();
      } catch {
        return;
      }
    }

    if (message.author?.bot) {
      return;
    }

    const targetChannel = await resolveLogChannel(message);
    if (!targetChannel) {
      return;
    }

    const me = message.guild.members.me;
    if (!me) {
      return;
    }

    const permissions = targetChannel.permissionsFor(me);
    if (!permissions?.has(PermissionsBitField.Flags.SendMessages) || !permissions.has(PermissionsBitField.Flags.EmbedLinks)) {
      return;
    }

    const member = await resolveMember(message);
    const roleList = member
      ? member.roles.cache
          .filter((role) => role.id !== message.guild.id)
          .map((role) => role.name)
          .join(", ")
      : "未知";

    const isAdmin = member
      ? member.permissions.has(PermissionsBitField.Flags.Administrator)
      : false;

    const deletedAt = new Date();
    const sentAt = message.createdAt || deletedAt;
    const gap = formatDuration(deletedAt.getTime() - sentAt.getTime());

    const attachmentsText = message.attachments.size
      ? message.attachments.map((attachment) => attachment.url).join("\n")
      : "";

    const contentText = [message.content?.trim(), attachmentsText]
      .filter(Boolean)
      .join("\n");

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("🗑️ 訊息已刪除")
      .addFields(
        {
          name: "頻道",
          value: `${message.channel}`,
          inline: true,
        },
        {
          name: "訊息作者",
          value: message.author ? `<@${message.author.id}>` : "未知",
          inline: true,
        },
        {
          name: "👤 作者資訊",
          value:
            `使用者名稱： ${message.author?.username ?? "未知"}\n` +
            `使用者ID： ${message.author?.id ?? "未知"}\n` +
            `是否為管理員： ${isAdmin ? "✅" : "❌"}`,
        },
        {
          name: "⏰ 時間資訊",
          value:
            `刪除時間： ${formatDate(deletedAt)}\n` +
            `發送時間： ${formatDate(sentAt)}\n` +
            `間隔時間： ${gap}`,
        },
        {
          name: "身分組",
          value: truncate(roleList || "無", 500),
        },
        {
          name: "訊息內容",
          value: truncate(contentText || "(無文字內容)", 1000),
        }
      )
      .setFooter({ text: `由 ${client.user?.username ?? "Bot"} 記錄` })
      .setTimestamp(deletedAt);

    const avatarUrl = message.author?.displayAvatarURL({ size: 256 });
    if (avatarUrl) {
      embed.setThumbnail(avatarUrl);
    }

    await targetChannel.send({ embeds: [embed] });
  },
};
