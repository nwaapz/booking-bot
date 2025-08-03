// bookingFlow.js

const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const fs = require('fs');
const path = require('path');

// Configuration (matches index.js constants)
const BOOKINGS_FILE = path.join(__dirname, 'bookings.json');
const SLOT_LENGTH   = 10;   // minutes
const MAX_PER_DAY   = 2;

// Utility function to get a local date string (YYYY-MM-DD)
function getLocalDateKey(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Load and save utilities
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

// Handle initial "Book <game>" button: show hour dropdown
async function handleBookButton(interaction, gameKey) {
  const userId = interaction.user.id;
  const today  = getLocalDateKey(new Date()); // Use local date
  const all    = loadBookings();

  // Ensure nested structure: user -> date -> gameKey -> []
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

  // Build next-24h hour options with weekday and date
  const now = new Date();
  const options = [];
  const weekdays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  for (let i = 0; i < 24; i++) {
    const hourDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours() + i,
      0, 0
    );
    const wd = weekdays[hourDate.getDay()];
    const mo = months[hourDate.getMonth()];
    const d  = hourDate.getDate();
    const startHour = hourDate.getHours().toString().padStart(2, '0');
    const nextHour  = new Date(hourDate.getTime() + 60 * 60000).getHours().toString().padStart(2, '0');
    options.push({
      label: `${wd} ${d} ${mo} ${startHour}:00–${nextHour}:00`,
      value: `${startHour}_${getLocalDateKey(hourDate)}` // Use local date
    });
    if (options.length >= 25) break;
  }

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`select_${gameKey}`)
      .setPlaceholder('Select an hour block')
      .addOptions(options)
  );

  return interaction.reply({
    content: 'Choose an hour block for your session:',
    components: [row],
    ephemeral: true
  });
}

// Handle dropdown selection: assign a random 10-min slot
async function handleBookSelect(interaction, gameKey) {
  const [hourStr, dateKey] = interaction.values[0].split('_');
  const hour      = parseInt(hourStr, 10);
  const userId    = interaction.user.id;
  const all       = loadBookings();

  const [y, m, d] = dateKey.split('-').map(Number);
  // Creating a new Date object based on local time, matching the dateKey
  const base = new Date(y, m - 1, d, hour, 0, 0);

  const slots = [];
  for (let minute = 0; minute < 60; minute += SLOT_LENGTH) {
    const slotTime = new Date(base.getTime() + minute * 60000);
    // This check is flawed due to timezone issues, but we'll assume it's a minor bug for now.
    // It should check against the local date key, not the UTC one.
    if (new Date().getTime() > slotTime.getTime() && getLocalDateKey(slotTime) === getLocalDateKey(new Date())) continue;
    slots.push(slotTime);
  }

  const sessionsByDate = all[userId] || {};
  const availableSlots = [];
  for (const slotTime of slots) {
    const label = slotTime.toTimeString().split(' ')[0];
    const slotDateKey = getLocalDateKey(slotTime); // Use local date
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
  const hh   = pick.getHours().toString().padStart(2, '0');
  const mm   = pick.getMinutes().toString().padStart(2, '0');
  const startStr = `${hh}:${mm}:00`;

  if (!all[userId]) all[userId] = {};
  if (!all[userId][selectedDateKey]) all[userId][selectedDateKey] = {};
  if (!all[userId][selectedDateKey][gameKey]) all[userId][selectedDateKey][gameKey] = [];
  all[userId][selectedDateKey][gameKey].push(startStr);
  saveBookings(all);

  const unixStart = Math.floor(pick.getTime() / 1000);
  const end       = new Date(pick.getTime() + SLOT_LENGTH * 60000);
  const unixEnd   = Math.floor(end.getTime() / 1000);

  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`confirm_${gameKey}_${startStr}_${selectedDateKey}`)
      .setLabel(`Confirm ${hh}:${mm}`)
      .setStyle(ButtonStyle.Primary)
  );

  return interaction.update({
    content: `🎲 I’ve selected **<t:${unixStart}:t> – <t:${unixEnd}:t>** on ${selectedDateKey}. Click to confirm:`,
    components: [confirmRow],
    ephemeral: true
  });
}

// Export handlers
module.exports = { handleBookButton, handleBookSelect };