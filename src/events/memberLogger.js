const { EmbedBuilder, PermissionsBitField } = require("discord.js");

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
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) {
    return `${days} 天 ${hours} 小時 ${minutes} 分鐘`;
  }

  if (hours > 0) {
    return `${hours} 小時 ${minutes} 分鐘`;
  }

  return `${minutes} 分鐘`;
}

async function resolveLogChannel(guild) {
  const channelId = process.env.MEMBER_LOG_CHANNEL_ID;
  if (!channelId) {
    return null;
  }

  try {
    return (
      guild.channels.cache.get(channelId) ||
      await guild.channels.fetch(channelId)
    );
  } catch {
    return null;
  }
}

async function canSendEmbed(channel, guild) {
  const me = guild.members.me;
  if (!me) {
    return false;
  }

  const permissions = channel.permissionsFor(me);
  return (
    permissions?.has(PermissionsBitField.Flags.SendMessages) &&
    permissions.has(PermissionsBitField.Flags.EmbedLinks)
  );
}

module.exports = {
  async onMemberAdd(member, client) {
    const { guild, user } = member;
    const logChannel = await resolveLogChannel(guild);
    if (!logChannel || !logChannel.isTextBased()) {
      return;
    }

    if (!(await canSendEmbed(logChannel, guild))) {
      return;
    }

    const now = new Date();
    const accountAge = formatDuration(now.getTime() - user.createdAt.getTime());

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("📥 成員加入")
      .addFields(
        {
          name: "成員",
          value: `<@${user.id}>`,
          inline: true,
        },
        {
          name: "使用者名稱",
          value: user.username,
          inline: true,
        },
        {
          name: "使用者 ID",
          value: user.id,
          inline: true,
        },
        {
          name: "帳號建立時間",
          value: `${formatDate(user.createdAt)}（${accountAge}前）`,
        },
        {
          name: "加入時間",
          value: formatDate(now),
          inline: true,
        },
        {
          name: "目前人數",
          value: `${guild.memberCount} 人`,
          inline: true,
        }
      )
      .setFooter({ text: `由 ${client.user?.username ?? "Bot"} 記錄` })
      .setTimestamp(now);

    const avatarUrl = user.displayAvatarURL({ size: 256 });
    if (avatarUrl) {
      embed.setThumbnail(avatarUrl);
    }

    await logChannel.send({ embeds: [embed] });
  },

  async onMemberRemove(member, client) {
    const { guild, user } = member;
    const logChannel = await resolveLogChannel(guild);
    if (!logChannel || !logChannel.isTextBased()) {
      return;
    }

    if (!(await canSendEmbed(logChannel, guild))) {
      return;
    }

    const now = new Date();
    const joinedAt = member.joinedAt;
    const timeInServer = joinedAt
      ? formatDuration(now.getTime() - joinedAt.getTime())
      : null;

    const roles = member.roles.cache
      .filter((role) => role.id !== guild.id)
      .map((role) => role.name);

    const embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle("📤 成員退出")
      .addFields(
        {
          name: "成員",
          value: `<@${user.id}>`,
          inline: true,
        },
        {
          name: "使用者名稱",
          value: user.username,
          inline: true,
        },
        {
          name: "使用者 ID",
          value: user.id,
          inline: true,
        },
        {
          name: "加入時間",
          value: joinedAt
            ? `${formatDate(joinedAt)}（停留 ${timeInServer}）`
            : "未知",
        },
        {
          name: "退出時間",
          value: formatDate(now),
          inline: true,
        },
        {
          name: "目前人數",
          value: `${guild.memberCount} 人`,
          inline: true,
        },
        {
          name: "身分組",
          value: roles.length > 0 ? roles.join("、") : "無",
        }
      )
      .setFooter({ text: `由 ${client.user?.username ?? "Bot"} 記錄` })
      .setTimestamp(now);

    const avatarUrl = user.displayAvatarURL({ size: 256 });
    if (avatarUrl) {
      embed.setThumbnail(avatarUrl);
    }

    await logChannel.send({ embeds: [embed] });
  },
};
