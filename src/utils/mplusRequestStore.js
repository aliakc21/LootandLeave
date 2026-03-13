const { v4: uuidv4 } = require('./uuid');

const SESSION_TTL_MS = 30 * 60 * 1000;
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

function createSession(userId, guildId, runCount) {
    cleanupExpiredSessions();
    clearUserSessions(userId);

    const sessionId = `mplus-${uuidv4().substring(0, 8)}`;
    const session = {
        sessionId,
        userId,
        guildId,
        runCount,
        runs: [],
        createdAt: Date.now(),
    };
    sessions.set(sessionId, session);
    return session;
}

function getSession(sessionId) {
    cleanupExpiredSessions();
    return sessions.get(sessionId) || null;
}

function addRun(sessionId, run) {
    const session = getSession(sessionId);
    if (!session) {
        return null;
    }

    session.runs.push(run);
    return session;
}

function clearSession(sessionId) {
    sessions.delete(sessionId);
}

module.exports = {
    createSession,
    getSession,
    addRun,
    clearSession,
};
