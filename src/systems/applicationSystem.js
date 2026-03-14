const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Database = require('../database/database');
const logger = require('../utils/logger');
const { fetchCharacterData } = require('../utils/wowApi');
const { v4: uuidv4 } = require('../utils/uuid');
const characterSystem = require('./characterSystem');

let client = null;

function initialize(botClient) {
    client = botClient;
    logger.logInfo('Application System initialized');
}

async function processApplication(applicantId, applicationData, characters) {
    try {
        if (!Array.isArray(characters) || characters.length === 0) {
            return { success: false, message: 'Please add at least one character to your application.' };
        }

        const validatedCharacters = [];
        for (const entry of characters) {
            const characterData = await fetchCharacterData(entry.characterName, entry.characterRealm);
            if (!characterData) {
                return { success: false, message: `Character not found on Raider.IO: ${entry.characterName}-${entry.characterRealm}` };
            }

            validatedCharacters.push({
                characterName: entry.characterName,
                characterRealm: entry.characterRealm,
                class: characterData.class,
                spec: characterData.spec,
                itemLevel: characterData.itemLevel,
                rioScore: characterData.rioScore,
            });
        }

        const primaryCharacter = validatedCharacters[0];
        const applicationId = `app-${uuidv4().substring(0, 8)}`;

        await Database.run(
            `INSERT INTO booster_applications (application_id, applicant_id, battletag, last_season_rio, previous_communities, years_playing, years_boosting, registered_characters, character_name, character_realm, experience, rio_score, item_level, class_name, spec_name, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                applicationId,
                applicantId,
                applicationData.battletag,
                applicationData.lastSeasonRio,
                applicationData.previousCommunities || null,
                applicationData.yearsPlaying,
                applicationData.yearsBoosting,
                JSON.stringify(validatedCharacters),
                primaryCharacter.characterName,
                primaryCharacter.characterRealm,
                null,
                primaryCharacter.rioScore,
                primaryCharacter.itemLevel,
                primaryCharacter.class,
                primaryCharacter.spec,
                'pending'
            ]
        );

        await postApplicationToChannel(applicationId, applicantId, applicationData, validatedCharacters);
        logger.logAction('BOOSTER_APPLICATION_SUBMITTED', applicantId, {
            applicationId,
            battletag: applicationData.battletag,
            characters: validatedCharacters.length,
        });

        return { success: true, applicationId };
    } catch (error) {
        logger.logError(error, { context: 'PROCESS_APPLICATION', applicantId });
        return { success: false, message: `Error: ${error.message}` };
    }
}

async function postApplicationToChannel(applicationId, applicantId, applicationData, characters) {
    try {
        const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
        const channel = guild.channels.cache.find(entry => entry.name === 'booster-applications');
        if (!channel) {
            logger.logWarning('Booster Applications channel not found');
            return;
        }

        const characterLines = characters.map((entry, index) =>
            `${index + 1}. ${entry.characterName}-${entry.characterRealm} | ${entry.class}${entry.spec ? ` (${entry.spec})` : ''} | iLvl ${entry.itemLevel} | RIO ${entry.rioScore}`
        ).join('\n');

        const embed = new EmbedBuilder()
            .setTitle('📝 New Booster Application')
            .setDescription(`Application from <@${applicantId}>`)
            .addFields(
                { name: '🆔 Application ID', value: `\`${applicationId}\``, inline: true },
                { name: '👤 Applicant', value: `<@${applicantId}>`, inline: true },
                { name: '🏷️ BattleTag', value: applicationData.battletag, inline: true },
                { name: '🏆 Last Season RIO', value: String(applicationData.lastSeasonRio), inline: true },
                { name: '🎮 Years Playing', value: String(applicationData.yearsPlaying), inline: true },
                { name: '💼 Years Boosting', value: String(applicationData.yearsBoosting), inline: true },
                { name: '🌐 Previous Communities', value: applicationData.previousCommunities || 'None provided', inline: false },
                { name: `🧙 Characters (${characters.length})`, value: characterLines.slice(0, 1024), inline: false }
            )
            .setColor(0x5865F2)
            .setTimestamp()
            .setFooter({ text: `Application ID: ${applicationId}` });

        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`approve_application_${applicationId}`)
                .setLabel('Approve')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
            new ButtonBuilder()
                .setCustomId(`reject_application_${applicationId}`)
                .setLabel('Reject')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
        );

        await channel.send({ embeds: [embed], components: [actionRow] });
    } catch (error) {
        logger.logError(error, { context: 'POST_APPLICATION_TO_CHANNEL', applicationId });
    }
}

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

        const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
        const boosterRoleId = process.env.ROLE_BOOSTER;
        const applicantRoleId = process.env.ROLE_BOOSTER_APPLICANT;
        const member = await guild.members.fetch(application.applicant_id);

        if (boosterRoleId) {
            const boosterRole = guild.roles.cache.get(boosterRoleId);
            if (member && boosterRole) {
                await member.roles.add(boosterRole);
            }
        }

        if (applicantRoleId) {
            const applicantRole = guild.roles.cache.get(applicantRoleId);
            if (member && applicantRole) {
                await member.roles.remove(applicantRole);
            }
        }

        const registeredCharacters = application.registered_characters ? JSON.parse(application.registered_characters) : [];
        for (const entry of registeredCharacters) {
            await characterSystem.registerCharacter(application.applicant_id, entry.characterName, entry.characterRealm);
        }

        logger.logAction('BOOSTER_APPLICATION_APPROVED', approvedBy, { applicationId, applicantId: application.applicant_id });
        return { success: true, message: 'Application approved successfully.' };
    } catch (error) {
        logger.logError(error, { context: 'APPROVE_APPLICATION', applicationId });
        return { success: false, message: `Error: ${error.message}` };
    }
}

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

        const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
        const applicantRoleId = process.env.ROLE_BOOSTER_APPLICANT;
        if (applicantRoleId) {
            const member = await guild.members.fetch(application.applicant_id);
            const applicantRole = guild.roles.cache.get(applicantRoleId);
            if (member && applicantRole) {
                await member.roles.remove(applicantRole);
            }
        }

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
