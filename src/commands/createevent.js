const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const calendarSystem = require('../systems/calendarSystem');
const logger = require('../utils/logger');
const { MIDNIGHT_RAIDS, RAID_DIFFICULTIES, RAID_BOOST_TYPES, buildRaidEventName, findRaidBoostTypeById } = require('../utils/contentCatalog');
const { parseCutConfig, formatCutRates } = require('../utils/cutConfig');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('createevent')
        .setDescription('Create a new event/raid')
        .addStringOption(option =>
            option.setName('raid')
                .setDescription('Raid')
                .setRequired(true)
                .addChoices(...MIDNIGHT_RAIDS.map(raid => ({ name: raid.label, value: raid.id }))))
        .addStringOption(option =>
            option.setName('difficulty')
                .setDescription('Raid difficulty')
                .setRequired(true)
                .addChoices(...RAID_DIFFICULTIES.map(difficulty => ({ name: difficulty.label, value: difficulty.id }))))
        .addStringOption(option =>
            option.setName('boost_type')
                .setDescription('Raid boost type')
                .setRequired(true)
                .addChoices(...RAID_BOOST_TYPES.map(boostType => ({ name: boostType.label, value: boostType.id }))))
        .addStringOption(option =>
            option.setName('date')
                .setDescription('Date (format: DD-MM-YYYY)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('time')
                .setDescription('Time (format: HH:MM)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('description')
                .setDescription('Optional event description')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('min_item_level')
                .setDescription('Minimum item level required for this raid')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('min_rio_score')
                .setDescription('Minimum Raider.IO score required for this raid')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('capacity')
                .setDescription('Optional max number of clients for this raid (0 = unlimited)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('cuts')
                .setDescription('Optional cut config in the format 30/10/60 (treasury/advertiser/booster)')
                .setRequired(false)),
    async execute(interaction) {
        // Permission check
        const adminRole = process.env.ROLE_ADMIN;
        const managementRole = process.env.ROLE_MANAGEMENT;
        const isServerAdmin = interaction.member.permissions.has('Administrator');
        const hasAdminRole = adminRole && interaction.member.roles.cache.has(adminRole);
        const hasManagementRole = managementRole && interaction.member.roles.cache.has(managementRole);

        if (!isServerAdmin && !hasAdminRole && !hasManagementRole) {
            return interaction.reply({
                content: 'You do not have permission to use this command. You need Administrator permissions or Admin/Management role.',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const raidId = interaction.options.getString('raid');
            const difficultyId = interaction.options.getString('difficulty');
            const raidBoostType = interaction.options.getString('boost_type');
            const eventName = buildRaidEventName(raidId, difficultyId);
            const description = interaction.options.getString('description') || '';
            const datePart = interaction.options.getString('date');
            const timePart = interaction.options.getString('time') || '20:00';
            const minItemLevel = interaction.options.getInteger('min_item_level') || 0;
            const minRioScore = interaction.options.getInteger('min_rio_score') || 0;
            const clientLimit = interaction.options.getInteger('capacity') || 0;
            const cutsInput = interaction.options.getString('cuts');
            const customCuts = cutsInput ? parseCutConfig(cutsInput) : null;

            if (!eventName) {
                return interaction.editReply({ content: '❌ Invalid raid or difficulty selection.' });
            }
            const boostType = findRaidBoostTypeById(raidBoostType);
            if (!boostType) {
                return interaction.editReply({ content: '❌ Invalid raid boost type selected.' });
            }

            // Parse date/time (DD-MM-YYYY + HH:MM)
            const [day, month, year] = datePart.split('-').map(Number);
            const [hours, minutes] = timePart.split(':').map(Number);

            const scheduledDate = new Date(year, month - 1, day, hours, minutes);

            if (isNaN(scheduledDate.getTime())) {
                return interaction.editReply({ content: '❌ Invalid date format. Please use DD-MM-YYYY HH:MM format (e.g., 15-03-2026 16:30).' });
            }

            if (minItemLevel < 0 || minRioScore < 0 || clientLimit < 0) {
                return interaction.editReply({ content: '❌ Minimum item level, Raider.IO score, and client limit must be zero or higher.' });
            }

            // Create event (will create channel automatically)
            const result = await calendarSystem.createEvent(
                eventName,
                description,
                scheduledDate,
                interaction.user.id,
                interaction.guild,
                { minItemLevel, minRioScore, clientLimit, eventDifficulty: difficultyId, customCuts, raidBoostType }
            );
            
            await interaction.editReply({ 
                content: `✅ Event created!\n**Event ID:** ${result.eventId}\n**Channel:** ${result.channel}\n**Category:** ${new Date(scheduledDate).toLocaleDateString('en-US', { weekday: 'long' })}\n**Boost Type:** ${boostType.label}\n**Requirements:** iLvl ${minItemLevel}+ | RIO ${minRioScore}+\n**Client Limit:** ${clientLimit === 0 ? 'Unlimited' : clientLimit}\n**Cuts:** ${customCuts ? formatCutRates(customCuts) : 'Default env/config cuts'}` 
            });
        } catch (error) {
            logger.logError(error, { context: 'CREATE_EVENT_COMMAND', userId: interaction.user.id });
            await interaction.editReply({ content: `❌ Error: ${error.message}` });
        }
    },
};
