import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const EXPECTED_SPRITE_SHA256 = '7a45ba449d16d91ae02bed0398ad438d350124ce765fe7bf53295404dfc9cd88';

describe('country flag sprite', () => {
  it('keeps the verified 26 x 26 fixed-cell asset', () => {
    const sprite = readFileSync(resolve(process.cwd(), 'public/flags/flags-4x3.png'));

    expect(sprite.subarray(1, 4).toString()).toBe('PNG');
    expect(sprite.readUInt32BE(16)).toBe(26 * 48);
    expect(sprite.readUInt32BE(20)).toBe(26 * 36);
    expect(createHash('sha256').update(sprite).digest('hex')).toBe(EXPECTED_SPRITE_SHA256);
  });
});
