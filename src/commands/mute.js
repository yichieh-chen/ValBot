const { PermissionsBitField, SlashCommandBuilder } = require("discord.js");

const MAX_TIMEOUT_MINUTES = 40320;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("禁言")
    .setDescription("禁言指定成員")
    .addUserOption((option) =>
      option
        .setName("對象")
        .setDescription("要被禁言的使用者")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("持續時間")
        .setDescription("禁言時間（分鐘，1 到 40320）")
        .setMinValue(1)
        .setMaxValue(MAX_TIMEOUT_MINUTES)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("原因")
        .setDescription("禁言原因")
        .setMaxLength(200)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "這個指令只能在伺服器內使用。",
        ephemeral: true,
      });
      return;
    }

    const targetUser = interaction.options.getUser("對象", true);
    const durationMinutes = interaction.options.getInteger("持續時間", true);
    const reason = interaction.options.getString("原因", true);

    await interaction.deferReply();

    if (targetUser.bot) {
      await interaction.editReply("不能對機器人使用禁言。");
      return;
    }

    const me = interaction.guild.members.me;
    if (!me) {
      await interaction.editReply("目前無法確認機器人權限，請稍後再試。");
      return;
    }

    if (!me.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      await interaction.editReply("我缺少 Moderate Members 權限，無法執行禁言。");
      return;
    }

    let targetMember;
    try {
      targetMember =
        interaction.guild.members.cache.get(targetUser.id) ||
        await interaction.guild.members.fetch(targetUser.id);
    } catch {
      await interaction.editReply("找不到該成員，請確認他仍在伺服器中。");
      return;
    }

    if (!targetMember.moderatable) {
      await interaction.editReply("無法禁言此成員，可能是身分組階級高於我或目標是擁有者。");
      return;
    }

    if (interaction.member.id === targetMember.id) {
      await interaction.editReply("你不能禁言自己。");
      return;
    }

    const durationMs = durationMinutes * 60 * 1000;
    const fullReason = `${reason} | by ${interaction.user.tag}`;

    try {
      await targetMember.timeout(durationMs, fullReason);
      await interaction.editReply(
        `已將 <@${targetMember.id}> 禁言 ${durationMinutes} 分鐘。\n原因：${reason}\n執行者：<@${interaction.user.id}>`
      );
    } catch (error) {
      console.error("Mute command error:", error);
      await interaction.editReply("禁言失敗，請確認我是否有足夠權限。");
    }
  },
};
