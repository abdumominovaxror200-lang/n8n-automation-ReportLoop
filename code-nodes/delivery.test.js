'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildDelivery, TELEGRAM_LIMIT } = require('./delivery.js');

const complete = {
  client_id: 'client-01',
  recipients: 'first@example.test, second@example.test',
  telegram_chat_id: '-100123456',
  subject: 'Agency — Monthly report — August vs July',
  html: '<p>Report</p>',
  text: 'Monthly report',
};

test('complete item enables Gmail and Telegram delivery', () => {
  const result = buildDelivery(complete);
  assert.deepEqual(result.gmail, {
    send: true,
    to: ['first@example.test', 'second@example.test'],
    subject: complete.subject,
    html: complete.html,
  });
  assert.deepEqual(result.telegram, {
    send: true,
    chatId: '-100123456',
    text: complete.text,
  });
});

test('empty recipients disable Gmail without disabling Telegram', () => {
  const result = buildDelivery({ ...complete, recipients: ' , ' });
  assert.equal(result.gmail.send, false);
  assert.deepEqual(result.gmail.to, []);
  assert.equal(result.telegram.send, true);
});

test('empty or zero chat ID disables Telegram', () => {
  assert.equal(buildDelivery({ ...complete, telegram_chat_id: '' }).telegram.send, false);
  assert.equal(buildDelivery({ ...complete, telegram_chat_id: '0' }).telegram.send, false);
});

test('Telegram text is truncated to 4096 characters with an ellipsis', () => {
  const result = buildDelivery({ ...complete, text: 'x'.repeat(TELEGRAM_LIMIT + 50) });
  assert.equal(result.telegram.text.length, TELEGRAM_LIMIT);
  assert.equal(result.telegram.text.at(-1), '…');
});
