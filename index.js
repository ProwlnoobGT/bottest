const express = require('express');
const axios = require('axios');
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Discord Client
const bot = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

// Gather sensitive keys from Railway's environment variables
const { CLIENT_ID, CLIENT_SECRET, BOT_TOKEN, GUILD_ID, ROLE_ID, BLOXLINK_API_KEY, RAILWAY_PUBLIC_URL } = process.env;
const REDIRECT_URI = `${RAILWAY_PUBLIC_URL}/callback`;

// 1. Landing Website Entry (Forwards users to Discord OAuth)
app.get('/', (req, res) => {
    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify`;
    res.redirect(discordAuthUrl);
});

// 2. OAuth2 Callback Processing Hook
app.get('/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send('Authentication code is missing.');

    try {
        // Exchange Discord Code for Token
        const tokenRes = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: REDIRECT_URI,
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

        // Retrieve authorized user profile metadata
        const userRes = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${tokenRes.data.access_token}` }
        });
        const discordUserId = userRes.data.id;

        // Fetch verification mapping check via Bloxlink's public API
        try {
            await axios.get(`https://api.blox.link/v4/public/guilds/${GUILD_ID}/discord-user/${discordUserId}`, {
                headers: { Authorization: BLOXLINK_API_KEY }
            });

            // Assign server verification role inside target guild
            const guild = await bot.guilds.fetch(GUILD_ID);
            const member = await guild.members.fetch(discordUserId);
            await member.roles.add(ROLE_ID);
        } catch (apiErr) {
            console.log("User mapping not synced on Bloxlink databases, skipping internal role assignment.");
        }

        // Forward them straight out to blox.link main site
        res.redirect('https://blox.link');

    } catch (err) {
        console.error("Verification callback pipeline fault:", err.message);
        res.status(500).send('An unexpected fault occurred during execution.');
    }
});

// 3. Listen for /verify setup slash commands
bot.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'verify') {
        try {
            // Acknowledge interaction instantly to bypass the 3-second timeout rule
            await interaction.reply({ content: 'Processing verification setup...', ephemeral: true });

            // Check if user possesses Admin privileges
            if (!interaction.member.permissions.has('Administrator')) {
                return await interaction.editReply({ content: 'You must be an administrator to use this command.' });
            }

            // Construct Link Button pointing directly to your custom URL link
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('Verify with Bloxlink')
                    .setURL('https://bloxlink.pk/verify?server=8665204437024239')
                    .setStyle(ButtonStyle.Link)
            );

            // Post your welcome message cleanly into the channel
            await interaction.channel.send({
                content: 'Welcome to AM & MM2! Click the button below to Verify with Bloxlink and gain access to the rest of the server!',
                components: [row]
            });

            // Update hidden message confirmation status
            await interaction.editReply({ content: 'Verification embed successfully posted!' });

        } catch (error) {
            console.error("Error executing verification interface drop:", error);
            try {
                await interaction.editReply({ content: `An error occurred while posting the setup embed. Error context: ${error.message}` });
            } catch (e) {}
        }
    }
});

// Register slash command mappings on bot startup
bot.once('ready', async () => {
    console.log(`Logged in as ${bot.user.tag}`);
    
    const commands = [
        new SlashCommandBuilder().setName('verify').setDescription('Posts the permanent verification button message.')
    ];

    const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
    try {
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
        console.log('Successfully registered /verify command local guild hook.');
    } catch (error) {
        console.error("Failed to push global application command hooks:", error);
    }
});

bot.login(BOT_TOKEN).then(() => {
    app.listen(PORT, () => console.log(`Web platform online on port ${PORT}`));
});
