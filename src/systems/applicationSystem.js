const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Database = require('../database/database');
const logger = require('../utils/logger');
const { fetchCharacterData } = require('../utils/wowApi');
const { v4: uuidv4 } = require('../utils/uuid');

let client = null;

function initialize(botClient) {
    client = botClient;
    logger.logInfo('Application System initialized');
}

// Process booster application
async function processApplication(applicantId, characterName, characterRealm, experience) {
    try {
        // Fetch character data from Raider.IO
        const characterData = await fetchCharacterData(characterName, characterRealm);

        if (!characterData) {
            return { success: false, message: 'Character not found on Raider.IO. Please verify the character name and realm.' };
        }

        const applicationId = `app-${uuidv4().substring(0, 8)}`;

        // Save application to database
        await Database.run(
            `INSERT INTO booster_applications (application_id, applicant_id, character_name, character_realm, experience, rio_score, item_level, class_name, spec_name, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [applicationId, applicantId, characterName, characterRealm, experience, characterData.rioScore, characterData.itemLevel, characterData.class, characterData.spec, 'pending']
        );

        // Post application to management channel
        await postApplicationToChannel(applicationId, applicantId, characterName, characterRealm, experience, characterData);

        logger.logAction('BOOSTER_APPLICATION_SUBMITTED', applicantId, { applicationId, characterName, characterRealm });

        return { success: true, applicationId };
    } catch (error) {
        logger.logError(error, { context: 'PROCESS_APPLICATION', applicantId });
        return { success: false, message: `Error: ${error.message}` };
    }
}

// Post application to management channel
async function postApplicationToChannel(applicationId, applicantId, characterName, characterRealm, experience, characterData) {
    try {
        const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
        const channelId = process.env.CHANNEL_APPLICATIONS;
        
        if (!channelId) {
            logger.logWarning('CHANNEL_APPLICATIONS not configured');
            return;
        }

        const channel = await guild.channels.fetch(channelId);
        if (!channel) {
            logger.logWarning('Applications channel not found');
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle('📝 New Booster Application')
            .setDescription(`Application from <@${applicantId}>`)
            .addFields(
                { name: '🆔 Application ID', value: `\`${applicationId}\``, inline: true },
                { name: '👤 Applicant', value: `<@${applicantId}>`, inline: true },
                { name: '🎮 Character', value: `${characterName}-${characterRealm}`, inline: true },
                { name: '⚔️ Class', value: characterData.class || 'Unknown', inline: true },
                { name: '🎯 Spec', value: characterData.spec || 'N/A', inline: true },
                { name: '📊 Item Level', value: String(characterData.itemLevel || 0), inline: true },
                { name: '🏆 RIO Score', value: String(characterData.rioScore || 0), inline: true },
                { name: '📝 Experience', value: experience || 'Not provided', inline: false }
            )
            .setColor(0x5865F2)
            .setTimestamp()
            .setFooter({ text: `Application ID: ${applicationId}` });

        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`approve_application_${applicationId}`)
                .setLabel('✅ Approve')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`reject_application_${applicationId}`)
                .setLabel('❌ Reject')
                .setStyle(ButtonStyle.Danger)
        );

        await channel.send({ embeds: [embed], components: [actionRow] });
    } catch (error) {
        logger.logError(error, { context: 'POST_APPLICATION_TO_CHANNEL', applicationId });
    }
}

// Approve application
async function approveApplication(applicationId, approvedBy) {
    try {
        const application = await Database.get(
            `SELECT * FROM booster_applications WHERE application_id = ?`,
            [applicationId]
        );

        if (!application) {
            return { success: false, message: 'Application not found.' };
        }

        if (application.status !== 'pending') {
            return { success: false, message: 'Application has already been processed.' };
        }

        await Database.run(
            `UPDATE booster_applications SET status = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ? WHERE application_id = ?`,
            ['approved', approvedBy, applicationId]
        );

        // Assign booster role if configured
        const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
        const boosterRoleId = process.env.ROLE_BOOSTER;
        if (boosterRoleId) {
            const member = await guild.members.fetch(application.applicant_id);
            const role = guild.roles.cache.get(boosterRoleId);
            if (member && role) {
                await member.roles.add(role);
            }
        }

        logger.logAction('BOOSTER_APPLICATION_APPROVED', approvedBy, { applicationId, applicantId: application.applicant_id });

        return { success: true, message: 'Application approved successfully.' };
    } catch (error) {
        logger.logError(error, { context: 'APPROVE_APPLICATION', applicationId });
        return { success: false, message: `Error: ${error.message}` };
    }
}

// Reject application
async function rejectApplication(applicationId, rejectedBy) {
    try {
        const application = await Database.get(
            `SELECT * FROM booster_applications WHERE application_id = ?`,
            [applicationId]
        );

        if (!application) {
            return { success: false, message: 'Application not found.' };
        }

        if (application.status !== 'pending') {
            return { success: false, message: 'Application has already been processed.' };
        }

        await Database.run(
            `UPDATE booster_applications SET status = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ? WHERE application_id = ?`,
            ['rejected', rejectedBy, applicationId]
        );

        logger.logAction('BOOSTER_APPLICATION_REJECTED', rejectedBy, { applicationId, applicantId: application.applicant_id });

        return { success: true, message: 'Application rejected.' };
    } catch (error) {
        logger.logError(error, { context: 'REJECT_APPLICATION', applicationId });
        return { success: false, message: `Error: ${error.message}` };
    }
}

module.exports = {
    initialize,
    processApplication,
    approveApplication,
    rejectApplication,
};
