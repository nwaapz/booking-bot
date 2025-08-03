// index.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  EmbedBuilder
} = require('discord.js');

const { handleBookButton, handleBookSelect } = require('./bookingFlow');

// === CONFIG ===
const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const BOOKINGS_FILE = path.join(__dirname, 'bookings.json');
const SLOT_LENGTH = 10;
const MAX_PER_DAY = 2;

const games = [
  { key: 'gameA', name: 'Game A', img: 'https://www.nintendo.com/eu/media/images/10_share_images/portals_3/2x1_SuperMarioHub.jpg' },
  { key: 'gameB', name: 'Game B', img: 'https://gonintendo.com/uploads/file_upload/upload/74866/Sunset.jpg' },
  { key: 'gameC', name: 'Game C', img: 'https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/i/4d04d46d-481e-452a-9bfd-75a8c1cc65a3/dfftnhw-434cac4b-0d0f-4b0a-ad84-d02feb4bd730.png' }
];

function loadBookings() {
  try {
    return JSON.parse(fs.readFileSync(BOOKINGS_FILE, 'utf8'));
  } catch {
    return {};
  }
}
function saveBookings(bookings) {
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
}
function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once(Events.ClientReady, async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  const channel = await client.channels.fetch(CHANNEL_ID);
  if (!channel) return console.error('❌ Channel not found');

  for (const g of games) {
    const embed = new EmbedBuilder()
      .setTitle(g.name)
      .setDescription(`Book or check bookings for **${g.name}**:`)
      .setImage(g.img)
      .setColor(0x00AE86);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`book_${g.key}`)
        .setLabel(`Book ${g.name}`)
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`check_${g.key}`)
        .setLabel(`Check ${g.name}`)
        .setStyle(ButtonStyle.Primary)
    );

    const msg = await channel.send({ embeds: [embed], components: [row] });
    await msg.pin();
  }

  console.log('✅ Sent and pinned game booking menus');
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

  const [action, ...args] = interaction.customId.split('_');
  const gameKey = args[0];

  if (action === 'book') {
    return handleBookButton(interaction, gameKey);
  }

  if (action === 'check') {
    const userId = interaction.user.id;
    const now = new Date();
    const todayKey = getLocalDateKey(now);
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const tomorrowKey = getLocalDateKey(tomorrow);
    const all = loadBookings();

    const todaySessions = all[userId]?.[todayKey]?.[gameKey] || [];
    const tomorrowSessions = all[userId]?.[tomorrowKey]?.[gameKey] || [];

    const totalSessions = todaySessions.length + tomorrowSessions.length;
    if (totalSessions === 0) {
      return interaction.reply({
        content: `📋 No bookings for today or tomorrow for **${gameKey}**.`,
        ephemeral: true
      });
    }

    const expired = [], openNow = [], upcoming = [];
    const formatSessions = (sessions, key, labelPrefix) => {
      sessions.forEach(str => {
        const [h, m] = str.split(':').map(Number);
        const [y, mm, d] = key.split('-').map(Number);
        const st = new Date(y, mm - 1, d, h, m, 0);
        const en = new Date(st.getTime() + SLOT_LENGTH * 60000);
        const unixSt = Math.floor(st.getTime() / 1000);
        const unixEn = Math.floor(en.getTime() / 1000);
        const label = `• <t:${unixSt}:t> – <t:${unixEn}:t>${labelPrefix}`;

        if (new Date().getTime() > en.getTime()) {
          expired.push(`[**Expired**] ${label}`);
        } else if (new Date().getTime() >= st.getTime()) {
          openNow.push(`[**Open Now**] ${label}`);
        } else {
          upcoming.push(`[**Upcoming**] ${label}`);
        }
      });
    };

    formatSessions(todaySessions, todayKey, '');
    formatSessions(tomorrowSessions, tomorrowKey, ` on ${tomorrowKey}`);

    let content = `📋 Your **${gameKey}** bookings:

`;
    if (openNow.length) content += openNow.join('\n') + '\n';
    if (upcoming.length) content += upcoming.join('\n') + '\n';
    if (expired.length) content += expired.join('\n') + '\n';

    const remainingToday = MAX_PER_DAY - todaySessions.length;
    content += `\n**Remaining today:** ${remainingToday}`;

    return interaction.reply({ content, ephemeral: true });
  }

  if (action === 'confirm') {
    const time = args[1];
    const dateKey = args[2];
    const [h, m, s] = time.split(':').map(Number);
    const [y, mm, d] = dateKey.split('-').map(Number);
    const st = new Date(y, mm - 1, d, h, m, s);
    const en = new Date(st.getTime() + SLOT_LENGTH * 60000);
    const us = Math.floor(st.getTime() / 1000);
    const ue = Math.floor(en.getTime() / 1000);

    return interaction.update({
      content: `✅ Confirmed your ${gameKey} booking for **${dateKey}**: <t:${us}:t> – <t:${ue}:t>`,
      components: []
    });
  }

  if (interaction.isStringSelectMenu()) {
    const [sel, gameKey] = interaction.customId.split('_');
    if (sel === 'select') {
      return handleBookSelect(interaction, gameKey);
    }
  }
});

client.login(TOKEN);

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3000;

app.get('/bookings/:discordId', (req, res) => {
  const userId = req.params.discordId;
  const today = getLocalDateKey(new Date());
  const all = loadBookings();
  const data = all[userId]?.[today] || {};
  res.json(data);
});

app.listen(PORT, () => console.log(`🌐 API listening on port ${PORT}`));
