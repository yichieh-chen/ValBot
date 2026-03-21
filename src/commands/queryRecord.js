const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
} = require("discord.js");
const {
  BUTTON_PREFIX,
  MODE_COMPETITIVE,
  MODE_UNRATED,
  normalizeRiotId,
  getCooldownRemainingMs,
  markUserQuery,
  getModeDisplayLabel,
  loadQueryContext,
  createSession,
  getSession,
  calculateModeStatsForSession,
  getDefaultModeForSession,
} = require("../controllers/queryRecordController");

function formatPercent(value) {
  return `${value.toFixed(2)}%`;
}

function createModeButtons(sessionId, activeMode) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${BUTTON_PREFIX}${sessionId}:${MODE_COMPETITIVE}`)
        .setLabel("競技模式 Competitive")
        .setStyle(activeMode === MODE_COMPETITIVE ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${BUTTON_PREFIX}${sessionId}:${MODE_UNRATED}`)
        .setLabel("一般模式 Unrated")
        .setStyle(activeMode === MODE_UNRATED ? ButtonStyle.Primary : ButtonStyle.Secondary)
    ),
  ];
}

function buildSummaryEmbed({ session, mode, modeStats }) {
  const [name, tag] = session.riotId.split("#");
  const { region, seasonLabel, accountData, mmrData } = session;
  const account = accountData?.data || {};
  const mmr = mmrData?.data || {};
  const currentMmr = mmr.current_data || {};
  const isCompetitive = mode === MODE_COMPETITIVE;

  const embed = new EmbedBuilder()
    .setColor(0xff4655)
    .setTitle(`VALORANT 戰績查詢: ${name}#${tag}`)
    .setDescription(`地區: ${region.toUpperCase()} | 賽季: ${seasonLabel} | 模式: ${getModeDisplayLabel(mode)}`)
    .addFields(
      {
        name: "帳號等級",
        value: String(account.account_level ?? "N/A"),
        inline: true,
      },
      {
        name: "目前牌位",
        value: isCompetitive ? (currentMmr.currenttierpatched || "N/A") : "N/A",
        inline: true,
      },
      {
        name: "RR",
        value: isCompetitive ? String(currentMmr.ranking_in_tier ?? "N/A") : "N/A",
        inline: true,
      },
      {
        name: "暴頭率",
        value: formatPercent(modeStats.headshotRate),
        inline: true,
      },
      {
        name: "K/D",
        value: modeStats.kd.toFixed(2),
        inline: true,
      },
      {
        name: "ACS",
        value: modeStats.acs.toFixed(2),
        inline: true,
      },
      {
        name: "勝率",
        value: formatPercent(modeStats.winRate),
        inline: true,
      },
      {
        name: "Damage/Round (ADR)",
        value: modeStats.adr.toFixed(2),
        inline: true,
      },
      {
        name: "KAST %",
        value: formatPercent(modeStats.kast),
        inline: true,
      },
      {
        name: "樣本場次",
        value: String(modeStats.matchCount),
        inline: true,
      }
    )
    .setFooter({ text: "Data by HenrikDev Unofficial Valorant API" })
    .setTimestamp();

  if (account?.card?.small) {
    embed.setThumbnail(account.card.small);
  }

  if (modeStats.matchCount === 0) {
    embed.addFields({ name: "提示", value: `本季在 ${getModeDisplayLabel(mode)} 找不到可統計的對戰資料。` });
  }

  return embed;
}

function buildModeEmbedFromSession(session, mode) {
  const modeStats = calculateModeStatsForSession(session, mode);
  return buildSummaryEmbed({ session, mode, modeStats });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("查詢戰績")
    .setDescription("查詢 Valorant 戰績（Henrik API）")
    .addStringOption((option) =>
      option
        .setName("地區")
        .setDescription("比賽地區")
        .addChoices(
          { name: "AP", value: "ap" },
          { name: "EU", value: "eu" },
          { name: "NA", value: "na" },
          { name: "KR", value: "kr" },
          { name: "LATAM", value: "latam" },
          { name: "BR", value: "br" }
        )
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("玩家")
        .setDescription("Riot ID，格式 Name#Tag")
        .setMaxLength(100)
        .setRequired(true)
    ),

  async execute(interaction) {
    const apiKey = process.env.HENRIK_API_KEY;
    if (!apiKey) {
      await interaction.reply({
        content: "尚未設定 HENRIK_API_KEY，請先在 .env 設定。",
        ephemeral: true,
      });
      return;
    }

    const remainingMs = getCooldownRemainingMs(interaction.user.id);
    if (remainingMs > 0) {
      const waitSeconds = (remainingMs / 1000).toFixed(1);
      await interaction.reply({
        content: `查詢太頻繁，請在 ${waitSeconds} 秒後再試。`,
        ephemeral: true,
      });
      return;
    }

    const region = interaction.options.getString("地區", true).trim().toLowerCase();
    const rawPlayer = interaction.options.getString("玩家", true);
    const player = normalizeRiotId(rawPlayer);

    if (!player) {
      await interaction.reply({
        content: "玩家格式錯誤，請使用 Name#Tag，例如 TenZ#NA1。",
        ephemeral: true,
      });
      return;
    }

    markUserQuery(interaction.user.id);

    await interaction.deferReply();

    try {
      const context = await loadQueryContext({
        apiKey,
        region,
        riotId: player,
      });

      const session = createSession({
        ownerId: interaction.user.id,
        context,
      });

      const defaultMode = getDefaultModeForSession(session);
      const embed = buildModeEmbedFromSession(session, defaultMode);
      const components = createModeButtons(session.id, defaultMode);

      await interaction.editReply({ embeds: [embed], components });
    } catch (error) {
      console.error("QueryRecord command error:", error);
      await interaction.editReply(`查詢失敗：${error.message || "未知錯誤"}\n請確認地區、玩家格式與 HENRIK_API_KEY 是否正確。`);
    }
  },

  canHandleComponent(customId) {
    return typeof customId === "string" && customId.startsWith(BUTTON_PREFIX);
  },

  async handleComponent(interaction) {
    const customId = interaction.customId;
    const payload = customId.slice(BUTTON_PREFIX.length);
    const [sessionId, mode] = payload.split(":");

    if (!sessionId || !mode || ![MODE_COMPETITIVE, MODE_UNRATED].includes(mode)) {
      await interaction.reply({ content: "按鈕資料無效，請重新使用 /查詢戰績。", ephemeral: true });
      return;
    }

    const session = getSession(sessionId);
    if (!session) {
      await interaction.reply({ content: "這個查詢已過期，請重新使用 /查詢戰績。", ephemeral: true });
      return;
    }

    if (session.ownerId !== interaction.user.id) {
      await interaction.reply({ content: "這不是你的查詢面板，請自行使用 /查詢戰績。", ephemeral: true });
      return;
    }

    const embed = buildModeEmbedFromSession(session, mode);
    const components = createModeButtons(sessionId, mode);
    await interaction.update({ embeds: [embed], components });
  },
};