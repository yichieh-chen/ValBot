const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const { toSegmentDisplay } = require("../utils/segmentDisplay");

const AUTHOR_ICON_URL = "https://image2url.com/r2/default/images/1773983649827-244076a2-ca35-44aa-a6f8-36b39d3025f9.jpg";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("伺服器資訊")
    .setDescription("顯示伺服器人數、延遲等資訊"),

  async execute(interaction, client) {
    if (!interaction.guild) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    const guild = interaction.guild;
    const totalMembers = guild.memberCount;
    const onlineMembers = guild.presences.cache.filter((presence) =>
      ["online", "idle", "dnd"].includes(presence.status)
    ).size;

    const digitalStat = toSegmentDisplay(`${onlineMembers}/${totalMembers}`);
    const latencyMs = Math.round(client.ws.ping);
    const digitalLatency = toSegmentDisplay(latencyMs);
    const guildThumbnailUrl = guild.iconURL({ size: 1024 });

    const embed = new EmbedBuilder()
      .setColor(0x00b894)
      .setAuthor({
        name: "伺服器狀態",
        iconURL: AUTHOR_ICON_URL,
      })
      .setTitle("伺服器狀態顯示")
      .setDescription("\n")
      .addFields(
        {
          name: "👤上線人數 / 總人數",
          value: `\`\`\`txt\n${digitalStat}\n\`\`\`\n${onlineMembers} / ${totalMembers}`,
          inline: true,
        },
        {
          name: "🔰伺服器延遲",
          value: `\`\`\`txt\n${digitalLatency}\n\`\`\`\n${latencyMs} ms`,
        }
      )
      .setFooter({ text: `Requested by ${interaction.user.username}` })
      .setTimestamp();

    if (guildThumbnailUrl) {
      embed.setThumbnail(guildThumbnailUrl);
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
