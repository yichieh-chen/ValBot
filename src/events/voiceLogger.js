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

async function resolveLogChannel(guild) {
  const channelId = process.env.VOICE_LOG_CHANNEL_ID;
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
  async onVoiceStateUpdate(oldState, newState, client) {
    const guild = newState.guild;
    const member = newState.member ?? oldState.member;
    if (!member || member.user.bot) {
      return;
    }

    const joined = !oldState.channelId && newState.channelId;
    const left = oldState.channelId && !newState.channelId;
    const moved =
      oldState.channelId &&
      newState.channelId &&
      oldState.channelId !== newState.channelId;

    if (!joined && !left && !moved) {
      return;
    }

    const logChannel = await resolveLogChannel(guild);
    if (!logChannel || !logChannel.isTextBased()) {
      return;
    }

    if (!(await canSendEmbed(logChannel, guild))) {
      return;
    }

    const now = new Date();
    const { user } = member;

    let color, title, fields;

    if (joined) {
      color = 0x57f287;
      title = "🔊 加入語音頻道";
      fields = [
        { name: "成員", value: `<@${user.id}>`, inline: true },
        { name: "使用者名稱", value: user.username, inline: true },
        { name: "​", value: "​", inline: true },
        { name: "頻道", value: newState.channel.name, inline: true },
        { name: "時間", value: formatDate(now), inline: true },
      ];
    } else if (left) {
      color = 0xe67e22;
      title = "🔇 離開語音頻道";
      fields = [
        { name: "成員", value: `<@${user.id}>`, inline: true },
        { name: "使用者名稱", value: user.username, inline: true },
        { name: "​", value: "​", inline: true },
        { name: "頻道", value: oldState.channel.name, inline: true },
        { name: "時間", value: formatDate(now), inline: true },
      ];
    } else {
      color = 0x5865f2;
      title = "🔀 切換語音頻道";
      fields = [
        { name: "成員", value: `<@${user.id}>`, inline: true },
        { name: "使用者名稱", value: user.username, inline: true },
        { name: "​", value: "​", inline: true },
        { name: "從", value: oldState.channel.name, inline: true },
        { name: "到", value: newState.channel.name, inline: true },
        { name: "時間", value: formatDate(now), inline: true },
      ];
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .addFields(fields)
      .setFooter({ text: `由 ${client.user?.username ?? "Bot"} 記錄` })
      .setTimestamp(now);

    const avatarUrl = user.displayAvatarURL({ size: 256 });
    if (avatarUrl) {
      embed.setThumbnail(avatarUrl);
    }

    await logChannel.send({ embeds: [embed] });
  },
};
