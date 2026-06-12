npm init -y
npm i discord.js
// index.js
import { Client, GatewayIntentBits, ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const VERIFY_URL = 'https://bloxlink.pk/verify?server=9517672273007324'; // use the REAL Bloxlink, not .pk

client.on('ready', () => console.log(`Logged in as ${client.user.tag}`));

client.on('interactionCreate', async (i) => {
  if (i.isChatInputCommand() && i.commandName === 'verify') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Verify')
        .setStyle(ButtonStyle.Link)   // Link-style buttons open URLs directly
        .setURL(VERIFY_URL),
    );
    await i.reply({ content: 'Click below to verify:', components: [row] });
  }
});

client.login(process.env.DISCORD_TOKEN);
