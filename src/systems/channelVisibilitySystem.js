const { ChannelType } = require('discord.js');
const Database = require('../database/database');
const logger = require('../utils/logger');

function getTargetIds(channel) {
    if (!channel) {
        return { targetType: null, targetId: null };
    }

    if (channel.type === ChannelType.GuildCategory) {
        return { targetType: 'category', targetId: channel.id };
    }

    return { targetType: 'channel', targetId: channel.id };
}

async function upsertVisibilityRule(roleId, channel, options = {}, updatedBy = null) {
    const { targetType, targetId } = getTargetIds(channel);
    const allowView = options.allowView !== false;
    const allowSend = Boolean(options.allowSend);
    const allowHistory = options.allowHistory !== false;

    await Database.run(
        `INSERT INTO channel_visibility_rules (
            role_id, target_type, target_id, allow_view, allow_send, allow_history, updated_by, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT (role_id, target_type, target_id)
         DO UPDATE SET
            allow_view = EXCLUDED.allow_view,
            allow_send = EXCLUDED.allow_send,
            allow_history = EXCLUDED.allow_history,
            updated_by = EXCLUDED.updated_by,
            updated_at = CURRENT_TIMESTAMP`,
        [roleId, targetType, targetId, allowView, allowSend, allowHistory, updatedBy]
    );

    return {
        roleId,
        targetType,
        targetId,
        allowView,
        allowSend,
        allowHistory,
    };
}

async function clearVisibilityRule(roleId, channel) {
    const { targetType, targetId } = getTargetIds(channel);
    await Database.run(
        `DELETE FROM channel_visibility_rules
         WHERE role_id = ? AND target_type = ? AND target_id = ?`,
        [roleId, targetType, targetId]
    );
}

async function getVisibilityRulesForGuild(guild) {
    const rules = await Database.all(`SELECT * FROM channel_visibility_rules ORDER BY role_id, target_type, target_id`);
    return rules.filter(rule => guild.channels.cache.has(rule.target_id));
}

async function getAllowedScopesForRoles(guild, roleIds = []) {
    const uniqueRoleIds = [...new Set(roleIds.filter(Boolean))];
    if (uniqueRoleIds.length === 0) {
        return { allowedChannelIds: new Set(), allowedCategoryIds: new Set() };
    }

    const rules = await getVisibilityRulesForGuild(guild);
    const allowedChannelIds = new Set();
    const allowedCategoryIds = new Set();

    for (const rule of rules) {
        if (!uniqueRoleIds.includes(rule.role_id) || !rule.allow_view) {
            continue;
        }

        if (rule.target_type === 'channel') {
            allowedChannelIds.add(rule.target_id);
        }
        if (rule.target_type === 'category') {
            allowedCategoryIds.add(rule.target_id);
        }
    }

    return { allowedChannelIds, allowedCategoryIds };
}

async function applyVisibilityRule(guild, roleId, channel, options = {}) {
    const role = guild.roles.cache.get(roleId);
    if (!role) {
        throw new Error('Role not found.');
    }

    await channel.permissionOverwrites.edit(roleId, {
        ViewChannel: options.allowView !== false,
        ReadMessageHistory: options.allowHistory !== false,
        SendMessages: Boolean(options.allowSend),
    });
}

async function setVisibilityRule(guild, roleId, channel, options = {}, updatedBy = null) {
    const rule = await upsertVisibilityRule(roleId, channel, options, updatedBy);
    await applyVisibilityRule(guild, roleId, channel, options);
    logger.logAction('CHANNEL_VISIBILITY_RULE_SET', updatedBy || 'SYSTEM', {
        roleId,
        targetType: rule.targetType,
        targetId: rule.targetId,
        allowView: rule.allowView,
        allowSend: rule.allowSend,
        allowHistory: rule.allowHistory,
    });
    return rule;
}

async function removeVisibilityRule(guild, roleId, channel, updatedBy = null) {
    await clearVisibilityRule(roleId, channel);
    await channel.permissionOverwrites.delete(roleId).catch(() => {});
    logger.logAction('CHANNEL_VISIBILITY_RULE_REMOVED', updatedBy || 'SYSTEM', {
        roleId,
        targetType: channel.type === ChannelType.GuildCategory ? 'category' : 'channel',
        targetId: channel.id,
    });
}

module.exports = {
    applyVisibilityRule,
    getAllowedScopesForRoles,
    getVisibilityRulesForGuild,
    removeVisibilityRule,
    setVisibilityRule,
};
