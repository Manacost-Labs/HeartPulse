import assert from 'node:assert/strict';
import {
  hsguruStreamerArchetype,
  hsguruStreamerDeckCodes,
  hsguruStreamerRows,
} from '../server/hsguruDeckInfo.js';

const code = 'AAECAf0GDsODB4ilB4mlB4qlB5GlB5OlB5SlB5WlB5alB5elB5qlB9i+B5vUB63ZBw2PnwSxnwTnoATTngaEmQfQsgeTvgfgvgfd1wew2Qe32QeN3AeO3AcAAA==';
const payload = {
  data: {
    tables: [{
      rows: [
        [`### XL Rafaamlock ${code} # copied`, 'Streamer', 'Standard'],
        [`### XL Rafaamlock ${code} # duplicate`, 'Streamer', 'Standard'],
        ['invalid row', 'Streamer', 'Standard'],
      ],
    }],
  },
};

assert.equal(hsguruStreamerRows(payload).length, 3);
assert.deepEqual(hsguruStreamerDeckCodes(payload), [code]);
assert.equal(
  hsguruStreamerArchetype(code, 'XL Rafaamlock', new Map([[code, { archetype: 'Rafaamlock', name: 'Rafaamlock' }]])),
  'Rafaamlock',
);
assert.equal(hsguruStreamerArchetype(code, 'XL Rafaamlock', new Map()), 'XL Rafaamlock');

console.log('HSGuru deck-info normalization tests passed');
