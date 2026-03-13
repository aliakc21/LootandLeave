require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const Database = require('./database/database');
const { initializeSystems } = require('./systems/systemManager');
const logger = require('./utils/logger');

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],
});

// Load commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        logger.logWarning(`Command ${file} is missing required "data" or "execute" property.`);
    }
}

// Load events
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
}

// Initialize database and systems
Database.initialize().then(() => {
    console.log('Database initialized successfully');
    initializeSystems(client);
    client.login(process.env.DISCORD_BOT_TOKEN);
}).catch(error => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
});

// Handle errors
client.on('error', error => {
    logger.logError(error, { context: 'DISCORD_CLIENT_ERROR' });
});

process.on('unhandledRejection', error => {
    logger.logError(error, { context: 'UNHANDLED_REJECTION' });
});

process.on('uncaughtException', error => {
    logger.logError(error, { context: 'UNCAUGHT_EXCEPTION' });
    process.exit(1);
});
