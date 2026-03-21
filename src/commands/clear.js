const {
  PermissionsBitField,
  SlashCommandBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Bulk delete recent messages in this channel")
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("要刪除多少則訊息 (1-100)")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),

  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.channel || !interaction.channel.isTextBased()) {
      await interaction.reply({
        content: "This command can only be used in a server text channel.",
        ephemeral: true,
      });
      return;
    }

    const amount = interaction.options.getInteger("amount", true);
    await interaction.deferReply({ ephemeral: true });

    const me = interaction.guild.members.me;
    if (!me) {
      await interaction.editReply("Cannot verify bot permissions right now.");
      return;
    }

    const botPermissions = interaction.channel.permissionsFor(me);
    if (!botPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
      await interaction.editReply("I need Manage Messages permission in this channel.");
      return;
    }

    try {
      const deleted = await interaction.channel.bulkDelete(amount, true);
      await interaction.editReply(`刪除了 ${deleted.size} 則訊息.`);
    } catch (error) {
      console.error("Clear 指令錯誤:", error);
      await interaction.editReply("刪除指令失敗，請幫我確認是否有足夠的權限，或是訊息是否過於久遠無法被批次刪除。");
    }
  },
};
