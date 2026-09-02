'use strict';

const TELEGRAM_LIMIT = 4096;

function recipients(value) {
  const entries = Array.isArray(value) ? value : String(value ?? '').split(',');
  return [...new Set(entries.map((entry) => String(entry).trim()).filter(Boolean))];
}

function telegramText(value) {
  const text = String(value ?? '');
  if (text.length <= TELEGRAM_LIMIT) return text;
  return `${text.slice(0, TELEGRAM_LIMIT - 1)}…`;
}

function buildDelivery(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new TypeError('Delivery item must be an object.');
  }
  const to = recipients(item.recipients);
  const rawChatId = String(item.telegram_chat_id ?? '').trim();
  const chatId = rawChatId && rawChatId !== '0' ? rawChatId : '';
  return {
    gmail: {
      send: to.length > 0,
      to,
      subject: String(item.subject ?? ''),
      html: String(item.html ?? ''),
    },
    telegram: {
      send: Boolean(chatId),
      chatId,
      text: telegramText(item.text),
    },
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildDelivery, TELEGRAM_LIMIT };
}
if (typeof $input !== 'undefined') {
  const rendered = $input.first().json;
  const client = $('Prepare Client and Periods').first().json;
  const item = {
    ...rendered,
    recipients: rendered.recipients ?? client.recipients,
    telegram_chat_id: rendered.telegram_chat_id ?? client.telegram_chat_id,
    client_id: rendered.client_id ?? client.client_id,
  };
  return [{ json: { ...item, ...buildDelivery(item) } }];
}
