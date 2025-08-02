require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const express = require('express');

const TOKEN          = process.env.DISCORD_TOKEN;
const CLIENT_ID      = process.env.CLIENT_ID;
const GUILD_ID       = process.env.GUILD_ID;
const BOOKINGS_FILE  = path.join(__dirname, 'bookings.json');
const SLOT_LENGTH    = 10;  // minutes
const MAX_PER_DAY    = 2;

// Utilities
function loadBookings() {
  try {
    if (fs.existsSync(BOOKINGS_FILE)) {
      return JSON.parse(fs.readFileSync(BOOKINGS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('❌ Failed to read bookings.json:', e);
  }
  return {};
}
function saveBookings(bookings) {
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
}

// Discord client & commands
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
  new SlashCommandBuilder()
    .setName('book')
    .setDescription(`Book ${SLOT_LENGTH} minutes of gameplay (max ${MAX_PER_DAY} per day)`),
  new SlashCommandBuilder()
    .setName('check')
    .setDescription('Check your booking status for today')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log('✅ Slash commands registered');
})();

client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const userId   = interaction.user.id;
  const today    = new Date().toISOString().split('T')[0];
  const bookings = loadBookings();
  bookings[userId] = bookings[userId] || {};
  bookings[userId][today] = bookings[userId][today] || [];
  const sessions = bookings[userId][today];

  if (interaction.commandName === 'book') {
    // Enforce daily limit
    if (sessions.length >= MAX_PER_DAY) {
      return interaction.reply({ content: `⚠️ You have already booked ${MAX_PER_DAY} times today.`, ephemeral: true });
    }

    // Determine slot start time
    const now = new Date();
    let newStart = now;
    if (sessions.length > 0) {
      const last = sessions[sessions.length - 1].split(':').map(Number);
      const lastStart = new Date();
      lastStart.setHours(last[0], last[1], last[2], 0);
      const lastEnd = new Date(lastStart.getTime() + SLOT_LENGTH * 60000);
      if (now < lastEnd) newStart = lastEnd;
    }

    // Record the booking
    const hh = `${newStart.getHours()}`.padStart(2,'0');
    const mm = `${newStart.getMinutes()}`.padStart(2,'0');
    const ss = `${newStart.getSeconds()}`.padStart(2,'0');
    const startTime = `${hh}:${mm}:${ss}`;
    sessions.push(startTime);
    saveBookings(bookings);

    // Compute end time
    const endObj = new Date(newStart.getTime() + SLOT_LENGTH * 60000);
    const eh = `${endObj.getHours()}`.padStart(2,'0');
    const em = `${endObj.getMinutes()}`.padStart(2,'0');
    const es = `${endObj.getSeconds()}`.padStart(2,'0');
    const endTime = `${eh}:${em}:${es}`;

    // Reply
    let reply;
    if (newStart > now) {
      const minsLeft = Math.ceil((newStart - now)/60000);
      reply = `⏳ Your current session ends in ${minsLeft} minute(s).\n` +
              `✅ Your next slot: ${startTime} – ${endTime} (${SLOT_LENGTH} min)`;
    } else {
      reply = `✅ Booking confirmed!\n⏱️ ${startTime} – ${endTime} (${SLOT_LENGTH} min)`;
    }
    return interaction.reply({ content: reply, ephemeral: true });
  }

  if (interaction.commandName === 'check') {
    const remaining = MAX_PER_DAY - sessions.length;
    if (sessions.length === 0) {
      return interaction.reply({
        content: `📋 You have no bookings today. You can book ${remaining} time(s).`,
        ephemeral: true
      });
    }

    // Build session details
    const details = sessions.map(startStr => {
      const [h,m,s] = startStr.split(':').map(Number);
      const st = new Date();
      st.setHours(h, m, s, 0);
      const en = new Date(st.getTime() + SLOT_LENGTH * 60000);
      const esh = `${en.getHours()}`.padStart(2,'0');
      const esm = `${en.getMinutes()}`.padStart(2,'0');
      const ess = `${en.getSeconds()}`.padStart(2,'0');
      return `• ${startStr} – ${esh}:${esm}:${ess}`;
    }).join('\n');

    const msg = `📋 You have ${sessions.length} booking(s) today and ${remaining} left.\nYour session(s):\n${details}`;
    return interaction.reply({ content: msg, ephemeral: true });
  }
});

client.login(TOKEN);

// Express API
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/bookings/:discordId', (req, res) => {
  const userId = req.params.discordId;
  const today  = new Date().toISOString().split('T')[0];
  const b      = loadBookings()[userId]?.[today] || [];
  if (b.length === 0) return res.status(404).json({ error: '❌ No bookings for today.' });
  res.json({ discordId: userId, date: today, bookings: b, slotLength: SLOT_LENGTH });
});
app.listen(PORT, () => console.log(`🌐 Booking API at http://localhost:${PORT}`));
