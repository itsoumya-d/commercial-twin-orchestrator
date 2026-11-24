import test from 'node:test';
import assert from 'node:assert/strict';

test('engine baseline environment check', () => {
  assert.equal(typeof process.version, 'string');
});
