const { PermissionsBitField, SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("解開禁言")
    .setDescription("看你可憐，幫你解開")
    .addUserOption((option) =>
      option
        .setName("對象")
        .setDescription("要解除禁言的使用者")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("原因")
        .setDescription("解除禁言原因")
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
    const reason = interaction.options.getString("原因", true);
    await interaction.deferReply();

    const me = interaction.guild.members.me;
    if (!me) {
      await interaction.editReply("目前無法確認機器人權限，請稍後再試。");
      return;
    }

    if (!me.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      await interaction.editReply("我缺少 Moderate Members 權限，無法解除禁言。");
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
      await interaction.editReply("無法解除此成員禁言，可能是身分組階級高於我或目標是擁有者。");
      return;
    }

    if (!targetMember.communicationDisabledUntilTimestamp) {
      await interaction.editReply(`<@${targetMember.id}> 目前沒有被禁言。`);
      return;
    }

    try {
      await targetMember.timeout(null, `${reason} | by ${interaction.user.tag}`);
      await interaction.editReply(
        `<@${targetMember.id}> 看你可憐，幫你解開\n原因：${reason}\n執行者：<@${interaction.user.id}>`
      );
    } catch (error) {
      console.error("Unmute command error:", error);
      await interaction.editReply("解除禁言失敗，請確認我是否有足夠權限。");
    }
  },
};
