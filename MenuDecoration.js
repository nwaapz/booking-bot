// bookingMessage.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function createBookingMessage(SLOT_LENGTH, MAX_PER_DAY, botUser) {
  const embed = new EmbedBuilder()
    .setColor(0x00AE86)
    .setTitle('🎮 Booking Bot')
    .setURL('https://yourwebsite.example.com')
    .setAuthor({ name: botUser.username, iconURL: botUser.displayAvatarURL() })
    .setDescription('Welcome! Use the buttons below to book your gameplay sessions or check your current bookings anytime.')
    .setThumbnail('https://example.com/thumbnail.png')
    .addFields(
      { name: 'Session Length', value: `${SLOT_LENGTH} minutes`, inline: true },
      { name: 'Max Sessions Per Day', value: `${MAX_PER_DAY}`, inline: true },
      { name: '\u200B', value: '\u200B' },
      { name: 'How to Book', value: 'Click **Book Session** to reserve your slot.' },
      { name: 'How to Check', value: 'Click **Check My Bookings** to see your booked sessions.' }
    )
    .setImage('https://supermariorun.com/assets/img/hero/hero_chara_mario_update_pc.png')
    .setFooter({ text: 'Happy Gaming!', iconURL: 'https://supermariorun.com/assets/img/hero/hero_chara_mario_update_pc.png' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('book_session')
      .setLabel('📅 Book Session')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('check_session')
      .setLabel('🔎 Check My Bookings')
      .setStyle(ButtonStyle.Primary)
  );

  return { embed, row };
}

module.exports = { createBookingMessage };
