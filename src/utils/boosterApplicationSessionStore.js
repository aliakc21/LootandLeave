const { v4: uuidv4 } = require('./uuid');

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_CHARACTERS_PER_SESSION = 20;
const sessions = new Map();

function cleanupExpiredSessions() {
    const now = Date.now();
    for (const [sessionId, session] of sessions.entries()) {
        if (now - session.createdAt > SESSION_TTL_MS) {
            sessions.delete(sessionId);
        }
    }
}

function clearUserSessions(userId) {
    for (const [sessionId, session] of sessions.entries()) {
        if (session.userId === userId) {
            sessions.delete(sessionId);
        }
    }
}

function createSession(userId, applicationData) {
    cleanupExpiredSessions();
    clearUserSessions(userId);

    const sessionId = `booster-app-${uuidv4().substring(0, 8)}`;
    const session = {
        sessionId,
        userId,
        applicationData,
        characters: [],
        createdAt: Date.now(),
    };
    sessions.set(sessionId, session);
    return session;
}

function getSession(sessionId) {
    cleanupExpiredSessions();
    return sessions.get(sessionId) || null;
}

function addCharacter(sessionId, characterName, characterRealm) {
    const session = getSession(sessionId);
    if (!session) {
        return { success: false, message: 'Application session not found.' };
    }

    if (session.characters.length >= MAX_CHARACTERS_PER_SESSION) {
        return { success: false, message: `You can add up to ${MAX_CHARACTERS_PER_SESSION} characters.` };
    }

    const key = `${characterName.toLowerCase()}|${characterRealm.toLowerCase()}`;
    if (session.characters.some(entry => `${entry.characterName.toLowerCase()}|${entry.characterRealm.toLowerCase()}` === key)) {
        return { success: false, message: 'That character is already added.' };
    }

    session.characters.push({ characterName, characterRealm });
    return { success: true, session };
}

function clearSession(sessionId) {
    sessions.delete(sessionId);
}

module.exports = {
    createSession,
    getSession,
    addCharacter,
    clearSession,
};
