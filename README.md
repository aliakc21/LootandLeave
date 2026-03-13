# LootandLeave Discord Bot

A professional World of Warcraft boosting service management bot for Discord. This bot provides a complete turnkey solution for managing boosting operations, including client isolation, ticket management, event scheduling, character management, and automated payouts.

## Features

- **Client Isolation**: Complete privacy protection with category-based isolation
- **Ticket System**: Private ticket channels for each client
- **Event Management**: Calendar system with weekday categories and automatic channel creation
- **Character Management**: Raider.IO integration for character data fetching and filtering
- **Weekly Character Locks**: Automatic character locking until weekly reset
- **Automated Payouts**: Commission-based gold distribution system
- **Booster Applications**: Automated application system with Raider.IO verification
- **Comprehensive Logging**: Event logs, customer logs, and booster payment logs
- **Excel Export**: Periodic data export for record keeping
- **Dynamic Configuration**: Manage bot settings via commands

## Prerequisites

- Node.js 18 or higher
- Discord Bot Token
- Discord Server with appropriate permissions
- PostgreSQL database (Railway Postgres recommended for production)

## Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `env.example` to `.env` and configure:
   ```bash
   cp env.example .env
   ```
4. Create a PostgreSQL database and set `DATABASE_URL` in `.env`
5. Edit `.env` with your Discord bot token, client ID, guild ID, and role/channel IDs
6. Deploy commands:
   ```bash
   node deploy-commands.js
   ```
7. Start the bot:
   ```bash
   npm start
   ```

## Configuration

### Environment Variables

- `DISCORD_BOT_TOKEN`: Your Discord bot token
- `DISCORD_CLIENT_ID`: Your Discord application client ID
- `DISCORD_GUILD_ID`: Your Discord server (guild) ID
- `DATABASE_URL`: PostgreSQL connection string
- `DATABASE_SSL`: Set to `true` for Railway hosted Postgres, `false` for most local PostgreSQL installs
- `CHANNEL_CLIENT_CATEGORY`: Category ID for client channels
- `CHANNEL_BOOSTER_CATEGORY`: Category ID for booster channels
- `CHANNEL_APPLICATIONS`: Channel ID for booster applications
- `CHANNEL_JOBS`: Channel ID for job postings
- `ROLE_ADMIN`: Admin role ID
- `ROLE_MANAGEMENT`: Management role ID
- `ROLE_ADVERTISER`: Advertiser role ID
- `ROLE_RAID_LEADER`: Optional raid leader role ID for roster selection
- `ROLE_BOOSTER`: Booster role ID
- `ROLE_CLIENT`: Client role ID

### Getting Discord IDs

1. Enable Developer Mode in Discord (User Settings > Advanced > Developer Mode)
2. Right-click on channels, roles, or servers to copy their IDs

### Railway Postgres

1. Create a `PostgreSQL` service in your Railway project
2. Copy Railway's provided `DATABASE_URL` into your bot service variables
3. Set `DATABASE_SSL=true`
4. Deploy the bot service with `npm start`

## Commands

### Setup Commands
- `/setup` - Initialize bot infrastructure (Admin only)
- `/deploy` - Deploy slash commands to Discord (Admin only)
- `/config` - Manage bot configuration (Admin only)

### Event Commands
- `/createevent` - Create a new event/raid with optional item level and Raider.IO requirements
- `/listcharacters` - List available characters for event application
- `/cancelevent` - Cancel an event (Admin/Management only)
- `/addeventgold` - Add gold to event balance pool (Admin/Management only)

### Character Commands
- `/registerchar` - Register a WoW character
- `/mychars` - View your registered characters
- `/refreshchars` - Refresh character data from Raider.IO

### Management Commands
- `/payout` - Process a payout for completed job/event
- `/postjob` - Post a job from a ticket to booster channels
- `/export` - Export all data to Excel
- `/auditlog` - View audit logs
- `/bank` - Check your current gold balance

## System Architecture

### Database Tables
- `users` - User information
- `tickets` - Client tickets
- `jobs` - Job postings
- `events` - Calendar events
- `event_applications` - Event applications
- `payouts` - Payout records
- `payout_details` - Individual booster payouts
- `payout_receipts` - Payment completion tracking
- `booster_balances` - Booster gold balances
- `booster_applications` - Booster applications
- `characters` - Registered characters
- `character_weekly_locks` - Character lock records
- `audit_logs` - System audit logs
- `bot_config` - Bot configuration

### Systems
- **Ticket System**: Manages client tickets with strict isolation
- **Calendar System**: Event creation, character selection, and roster management
- **Character System**: Character registration and weekly lock management
- **Payout System**: Automated gold distribution
- **Application System**: Booster application processing
- **Log Channel System**: Dedicated logging channels
- **Excel Export**: Data export functionality

## Security Features

- **Client Isolation**: Clients cannot see other clients or boosters
- **Manual Role Assignment**: No automatic role assignment
- **Comprehensive Logging**: All actions are logged
- **Permission Checks**: Strict permission validation
- **Audit Trail**: Complete audit log system

## Weekly Reset

Character locks automatically reset every Wednesday at 9 AM. This is handled by a cron job that runs weekly.

## Auto-End Events

Events are automatically ended 5 hours after their scheduled time. This is handled by a cron job that runs every 30 minutes.

## Log Channels

The bot creates three log channels:
- `event-logs` - Event completion/cancellation logs
- `customer-logs` - Closed ticket logs with message history
- `booster-logs` - Booster payment receipts with completion tracking

## Support

For issues or questions, please refer to the documentation files:
- `DEVELOPMENT.md` - Developer documentation
- `CUSTOMER_HANDBOOK.txt` - End-user handbook

## License

ISC
