// bookingFlow.js

const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const BOOKINGS_FILE = path.join(__dirname, 'bookings.json');
const SLOT_LENGTH = 10;
const MAX_PER_DAY = 2;

function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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

const tempBookings = new Map();

const gameData = {
  gameA: {
    name: 'Game A',
    image: 'https://www.nintendo.com/eu/media/images/10_share_images/portals_3/2x1_SuperMarioHub.jpg'
  },
  gameB: {
    name: 'Game B',
    image: 'https://gonintendo.com/uploads/file_upload/upload/74866/Sunset.jpg'
  },
  gameC: {
    name: 'Game C',
    image: 'https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/i/4d04d46d-481e-452a-9bfd-75a8c1cc65a3/dfftnhw-434cac4b-0d0f-4b0a-ad84-d02feb4bd730.png'
  }
};

async function handleBookButton(interaction, gameKey) {
  const userId = interaction.user.id;
  const today = getLocalDateKey(new Date());
  const all = loadBookings();

  if (!all[userId]) all[userId] = {};
  if (!all[userId][today]) all[userId][today] = {};
  if (!all[userId][today][gameKey]) all[userId][today][gameKey] = [];

  const sessions = all[userId][today][gameKey];
  if (sessions.length >= MAX_PER_DAY) {
    return interaction.reply({
      content: `⚠️ You’ve already booked ${MAX_PER_DAY} sessions today for this game.`,
      ephemeral: true
    });
  }

  const now = new Date();
  const options = [];
  const weekdays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  for (let i = 0; i < 24; i++) {
    const hourDate = new Date(
      now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + i, 0, 0
    );
    const wd = weekdays[hourDate.getDay()];
    const mo = months[hourDate.getMonth()];
    const d = hourDate.getDate();
    const startHour = hourDate.getHours().toString().padStart(2, '0');
    const nextHour = new Date(hourDate.getTime() + 60 * 60000).getHours().toString().padStart(2, '0');
    options.push({
      label: `${wd} ${d} ${mo} ${startHour}:00–${nextHour}:00`,
      value: `${startHour}_${getLocalDateKey(hourDate)}`
    });
    if (options.length >= 25) break;
  }

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`select_${gameKey}`)
      .setPlaceholder('Select an hour block')
      .addOptions(options)
  );

  const embed = new EmbedBuilder()
    .setTitle(`🎮 Booking for ${gameData[gameKey].name}`)
    .setDescription(`Select a time slot to book 10 minutes of gameplay for **${gameData[gameKey].name}**.`)
    .setImage(gameData[gameKey].image)
    .setColor(0x00AE86);

  return interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true
  });
}

async function handleBookSelect(interaction, gameKey) {
  const [hourStr, dateKey] = interaction.values[0].split('_');
  const hour = parseInt(hourStr, 10);
  const userId = interaction.user.id;
  
  const all = loadBookings();

  // FIX: Check the booking limit for the selected day
  const sessionsForSelectedDay = all[userId]?.[dateKey]?.[gameKey] || [];
  if (sessionsForSelectedDay.length >= MAX_PER_DAY) {
    return interaction.update({
      content: `⚠️ You’ve already booked ${MAX_PER_DAY} sessions for this game on **${dateKey}**.`,
      components: [],
      ephemeral: true
    });
  }

  const [y, m, d] = dateKey.split('-').map(Number);
  const base = new Date(y, m - 1, d, hour, 0, 0);

  const slots = [];
  for (let minute = 0; minute < 60; minute += SLOT_LENGTH) {
    const slotTime = new Date(base.getTime() + minute * 60000);
    if (new Date().getTime() > slotTime.getTime() && getLocalDateKey(slotTime) === getLocalDateKey(new Date())) continue;
    slots.push(slotTime);
  }

  const sessionsByDate = all[userId] || {};
  const availableSlots = [];
  for (const slotTime of slots) {
    const label = slotTime.toTimeString().split(' ')[0];
    const slotDateKey = getLocalDateKey(slotTime);
    const sessions = (sessionsByDate[slotDateKey] && sessionsByDate[slotDateKey][gameKey]) || [];
    if (!sessions.includes(label)) {
      availableSlots.push({ slotTime, dateKey: slotDateKey });
    }
  }

  if (availableSlots.length === 0) {
    return interaction.update({
      content: '❌ No available 10-minute slots left in that hour. Please choose another.',
      components: [],
      ephemeral: true
    });
  }

  const { slotTime: pick, dateKey: selectedDateKey } = availableSlots[Math.floor(Math.random() * availableSlots.length)];
  const hh = pick.getHours().toString().padStart(2, '0');
  const mm = pick.getMinutes().toString().padStart(2, '0');
  const startStr = `${hh}:${mm}:00`;

  tempBookings.set(`${userId}_${gameKey}`, {
    time: startStr,
    dateKey: selectedDateKey,
    expiresAt: Date.now() + 5 * 60 * 1000
  });

  const unixStart = Math.floor(pick.getTime() / 1000);
  const end = new Date(pick.getTime() + SLOT_LENGTH * 60000);
  const unixEnd = Math.floor(end.getTime() / 1000);

  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`confirm_${gameKey}_${startStr}_${selectedDateKey}`)
      .setLabel(`Confirm ${hh}:${mm}`)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`cancel_${gameKey}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  return interaction.update({
    content: `🎲 I’ve selected **<t:${unixStart}:t> – <t:${unixEnd}:t>** on ${selectedDateKey}. Click to confirm or cancel:`,
    components: [confirmRow],
    ephemeral: true
  });
}

module.exports = {
  handleBookButton,
  handleBookSelect,
  tempBookings
};