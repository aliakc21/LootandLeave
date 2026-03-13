const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deploy')
        .setDescription('Deploy slash commands to Discord (Admin only)'),
    async execute(interaction) {
        // Permission check
        const adminRole = process.env.ROLE_ADMIN;
        const isServerAdmin = interaction.member.permissions.has('Administrator');
        const hasAdminRole = adminRole && interaction.member.roles.cache.has(adminRole);

        if (!isServerAdmin && !hasAdminRole) {
            return interaction.reply({
                content: 'You do not have permission to use this command. You need Administrator permissions or Admin role.',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const commands = [];
            const commandsPath = path.join(__dirname);
            const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') && file !== 'deploy.js');

            for (const file of commandFiles) {
                const filePath = path.join(commandsPath, file);
                const command = require(filePath);
                if ('data' in command) {
                    commands.push(command.data.toJSON());
                }
            }

            const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
            const clientId = process.env.DISCORD_CLIENT_ID;
            const guildId = process.env.DISCORD_GUILD_ID;

            const data = await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commands },
            );

            await interaction.editReply({ content: `✅ Successfully reloaded ${data.length} application (/) commands.` });
        } catch (error) {
            await interaction.editReply({ content: `❌ Error: ${error.message}` });
        }
    },
};
