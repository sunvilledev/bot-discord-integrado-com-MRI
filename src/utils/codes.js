const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(length = 5) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return out;
}

function generateChallenge(count = 10) {
  const codes = new Set();
  while (codes.size < count) codes.add(randomCode(5));
  const list = [...codes];
  const correct = list[Math.floor(Math.random() * list.length)];
  return { codes: list, correct };
}

module.exports = { randomCode, generateChallenge };
