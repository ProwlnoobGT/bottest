const express = require('express');
const axios = require('axios');
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const bot = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

const { CLIENT_ID, CLIENT_SECRET, BOT_TOKEN, GUILD_ID, ROLE_ID, BLOXLINK_API_KEY, RAILWAY_PUBLIC_URL } = process.env;
const REDIRECT_URI = `${RAILWAY_PUBLIC_URL}/callback`;

// 1. Automatically forward incoming visitors straight to the Discord OAuth Prompt
app.get('/', (req, res) => {
    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify`;
    res.redirect(discordAuthUrl);
});

// 2. OAuth2 Callback Processing & Auto-Redirect to Blox.link
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

        // Fetch User Discord ID
        const userRes = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${tokenRes.data.access_token}` }
        });
        const discordUserId = userRes.data.id;

        // Fetch user data via Bloxlink's API 
        try {
            await axios.get(`https://api.blox.link/v4/public/guilds/${GUILD_ID}/discord-user/${discordUserId}`, {
                headers: { Authorization: BLOXLINK_API_KEY }
            });

            // Assign the verification server role
            const guild = await bot.guilds.fetch(GUILD_ID);
            const member = await guild.members.fetch(discordUserId);
            await member.roles.add(ROLE_ID);
        } catch (apiErr) {
            console.log("User might not be verified on Bloxlink yet, forwarding anyway.");
        }

        // AUTOMATICALLY REDIRECT USER TO BLOX.LINK
        res.redirect('https://blox.link');

    } catch (err) {
        console.error(err);
        res.status(500).send('An error occurred during verification.');
    }
});

// 3. Listen for the /verify setup command
bot.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'verify') {
        // Check if the user executing this has Admin permissions
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: 'You must be an administrator to use this command.', ephemeral: true });
        }

        // Create the Link Button pointing to your Railway URL
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Verify Identity')
                .setURL(RAILWAY_PUBLIC_URL) // Points directly to your server entry point
                .setStyle(ButtonStyle.Link)
        );

        // Send the permanent message with the button underneath
        await interaction.channel.send({
            content: '### You can verify with this button\nClick the button below to authorize the application and complete your verification registration profile.',
            components: [row]
        });

        await interaction.reply({ content: 'Verification embed successfully posted!', ephemeral: true });
    }
});

// Register the slash command on startup
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
        console.error(error);
    }
});

bot.login(BOT_TOKEN).then(() => {
    app.listen(PORT, () => console.log(`Web platform online on port ${PORT}`));
});
