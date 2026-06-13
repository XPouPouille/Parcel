const TelegramBot = require('node-telegram-bot-api');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

let bot = null;

function initBot(db) {
  if (!TOKEN) {
    console.log('[Telegram] TELEGRAM_BOT_TOKEN absent — bot désactivé');
    return null;
  }

  try {
    bot = new TelegramBot(TOKEN, { polling: true });

    bot.onText(/\/start/, (msg) => {
      bot.sendMessage(msg.chat.id,
        `📦 *Parcel Tracker Bot*\n\nID de ce chat: \`${msg.chat.id}\`\n\nUtilisez cet ID dans votre fichier .env comme TELEGRAM_CHAT_ID.`,
        { parse_mode: 'Markdown' }
      );
    });

    bot.onText(/\/colis/, (msg) => {
      const packages = db.prepare(`
        SELECT tracking_number, label, carrier, status, last_event
        FROM packages WHERE status != 'delivered' ORDER BY created_at DESC
      `).all();

      if (!packages.length) {
        bot.sendMessage(msg.chat.id, '📭 Aucun colis en cours.');
        return;
      }

      const lines = packages.map(p => {
        const name = p.label || p.tracking_number;
        const statusEmoji = statusEmoji_(p.status);
        return `${statusEmoji} *${name}*\n   ${p.carrier || 'Détection...'}\n   ${p.last_event || 'En attente de mise à jour'}`;
      }).join('\n\n');

      bot.sendMessage(msg.chat.id, `📦 *Colis en cours:*\n\n${lines}\n\n🔗 ${APP_URL}`, { parse_mode: 'Markdown' });
    });

    bot.onText(/\/aide/, (msg) => {
      bot.sendMessage(msg.chat.id,
        `*Commandes disponibles:*\n\n/colis — Liste des colis en cours\n/aide — Affiche cette aide\n\nID du chat: \`${msg.chat.id}\``,
        { parse_mode: 'Markdown' }
      );
    });

    bot.on('polling_error', (err) => {
      console.error('[Telegram] Polling error:', err.message);
    });

    console.log('[Telegram] Bot démarré');
    return bot;
  } catch (err) {
    console.error('[Telegram] Erreur init bot:', err.message);
    return null;
  }
}

function statusEmoji_(status) {
  const map = {
    in_transit: '🚚',
    pickup: '📬',
    undelivered: '⚠️',
    delivered: '✅',
    alert: '🚨',
    expired: '⏰',
    not_found: '❓',
    pending: '⏳',
  };
  return map[status] || '📦';
}

async function notify(pkg, oldStatus) {
  if (!bot || !CHAT_ID) return;

  const name = pkg.label || pkg.tracking_number;
  const emoji = statusEmoji_(pkg.status);
  const oldEmoji = statusEmoji_(oldStatus);

  let text = `${emoji} *${name}* — Statut mis à jour\n`;
  text += `${oldEmoji} → ${emoji} *${statusLabel(pkg.status)}*\n`;
  if (pkg.carrier) text += `🏢 ${pkg.carrier}\n`;
  if (pkg.last_event) text += `📍 ${pkg.last_event}\n`;
  text += `\n🔗 ${APP_URL}`;

  try {
    await bot.sendMessage(CHAT_ID, text, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[Telegram] Erreur envoi notification:', err.message);
  }
}

async function notifyNew(pkg) {
  if (!bot || !CHAT_ID) return;

  const name = pkg.label || pkg.tracking_number;
  const emoji = statusEmoji_(pkg.status);

  let text = `📦 *Nouveau colis ajouté*\n\n`;
  text += `📝 ${name}\n`;
  if (pkg.carrier) text += `🏢 ${pkg.carrier}\n`;
  text += `${emoji} ${statusLabel(pkg.status)}\n`;
  text += `\n🔗 ${APP_URL}`;

  try {
    await bot.sendMessage(CHAT_ID, text, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[Telegram] Erreur envoi notification:', err.message);
  }
}

function statusLabel(status) {
  const map = {
    in_transit: 'En transit',
    pickup: 'Prêt à retirer',
    undelivered: 'Tentative échouée',
    delivered: 'Livré ✅',
    alert: 'Alerte',
    expired: 'Expiré',
    not_found: 'Introuvable',
    pending: 'En attente',
  };
  return map[status] || status;
}

module.exports = { initBot, notify, notifyNew };
