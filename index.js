// index.js

require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const BOOKINGS_FILE = path.join(__dirname, 'bookings.json');

// Initialize Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// Define the /book command
const commands = [
  new SlashCommandBuilder()
    .setName('book')
    .setDescription('Book 10 minutes of gameplay (max 2 per day)')
].map(cmd => cmd.toJSON());

// Register the slash command
const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    console.log('Registering slash command...');
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log('✅ Slash command registered');
  } catch (err) {
    console.error('❌ Failed to register slash command:', err);
  }
})();

// Load or initialize booking data
let bookings = {};
if (fs.existsSync(BOOKINGS_FILE)) {
  try {
    bookings = JSON.parse(fs.readFileSync(BOOKINGS_FILE, 'utf8'));
  } catch (err) {
    console.error('Failed to parse bookings.json:', err);
    bookings = {};
  }
}

client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'book') return;

  const userId = interaction.user.id;
  const today = new Date().toISOString().split('T')[0];
  bookings[userId] = bookings[userId] || {};
  bookings[userId][today] = bookings[userId][today] || [];

  // Enforce max 2 bookings per day
  if (bookings[userId][today].length >= 2) {
    return interaction.reply({
      content: '⚠️ You have already booked 2 times today.',
      ephemeral: true
    });
  }

  // Record the booking
  const now = new Date();
  const startTime = now.toTimeString().split(' ')[0];
  bookings[userId][today].push(startTime);
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));

  const end = new Date(now.getTime() + 10 * 60 * 1000);
  const endTime = end.toTimeString().split(' ')[0];
  return interaction.reply({
    content: `✅ Booking confirmed!\n⏱️ ${startTime} – ${endTime} (10 minutes)`,
    ephemeral: true
  });
});

client.login(TOKEN);
