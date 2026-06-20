import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeTile, parseLegacyMapData, serializeLegacyMapData, tileCodeToFilename } from './legacyMapCodec.js';

test('parses legacy tile records', () => {
  const parsed = parseLegacyMapData('_a0101a20rgg_a1207z20a1g');

  assert.deepEqual(parsed.tiles, [
    { x: 1, y: 1, layer: 'a', tileCode: 'a20rgg', filename: 'a20rgg.gif' },
    { x: 12, y: 7, layer: 'z', tileCode: 'z20a1g', filename: 'z20a1g.gif' }
  ]);
});

test('parses text records and preserves unknown segments', () => {
  const parsed = parseLegacyMapData('_tHello there_unknown_a0202b20a1g');

  assert.deepEqual(parsed.notes, ['Hello there']);
  assert.deepEqual(parsed.unknownSegments, ['_unknown']);
  assert.equal(parsed.tiles[0].tileCode, 'b20a1g');
});

test('serializes tiles in stable grid order', () => {
  const legacy = serializeLegacyMapData({
    tiles: [
      { x: 2, y: 1, layer: 'b', tileCode: 'b20a1g' },
      { x: 1, y: 1, layer: 'a', tileCode: 'a20rgg' }
    ],
    notes: ['hello_world']
  });

  assert.equal(legacy, '_a0101a20rgg_a0201b20a1g_thello world');
});

test('merges tile patches by coordinate and layer', () => {
  const legacy = mergeTile('_a0101a20rgg', { x: 1, y: 1, layer: 'a', tileCode: 'a9999g' });
  assert.equal(legacy, '_a0101a9999g');

  const erased = mergeTile(legacy, { x: 1, y: 1, layer: 'a', tileCode: 'a9999g', erase: true });
  assert.equal(erased, '');
});

test('maps legacy filename suffixes', () => {
  assert.equal(tileCodeToFilename('thingp'), 'thingp.png');
  assert.equal(tileCodeToFilename('thingj'), 'thingj.jpg');
  assert.equal(tileCodeToFilename('thingg'), 'thingg.gif');
});
