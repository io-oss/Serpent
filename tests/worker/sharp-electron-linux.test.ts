import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import { loadSharp } from '../../src/shared/load-sharp';

const require = createRequire(import.meta.url);

function loadedModules(): string[] {
  return Object.keys(require.cache).map((entry) => entry.replaceAll('\\', '/'));
}

describe('Sharp under the Electron runtime', () => {
  it('uses the WebAssembly backend on Linux and processes images', async () => {
    const sharp = loadSharp();
    const loaded = loadedModules();
    if (process.platform === 'linux' && process.versions.electron) {
      // Native sharp bundles its own GLib, which collides with Electron's
      // system GLib and SIGSEGVs on the first image decode (electron#46323).
      expect(loaded.some((entry) => entry.includes('/@img/sharp-wasm32/'))).toBe(true);
      expect(loaded.some((entry) => /@img\/sharp-(?:libvips-)?linux/.test(entry))).toBe(false);
    }

    const png = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: { r: 20, g: 40, b: 60 },
      },
    }).png().toBuffer();
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    const jpeg = await sharp(png).jpeg().toBuffer();
    const metadata = await sharp(jpeg).metadata();
    expect(metadata.format).toBe('jpeg');
    expect(metadata.width).toBe(8);
    expect(metadata.height).toBe(8);
    const thumbnail = await sharp(jpeg)
      .rotate()
      .toColourspace('srgb')
      .resize({ width: 4, height: 4, fit: 'inside' })
      .webp({ quality: 80 })
      .toBuffer();
    expect(thumbnail.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect((await sharp(thumbnail).metadata()).format).toBe('webp');
  });
});
