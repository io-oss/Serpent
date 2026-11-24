import { registerHooks } from 'node:module';
import type sharp from 'sharp';

/**
 * Electron's Linux binary dynamically links the system GLib. Sharp's prebuilt
 * Linux backends (`@img/sharp-linux-*`) carry their own libvips with a private
 * GLib whose symbols interpose the system copy in the same process. Decoding
 * any real image then corrupts GLib/GObject state and the process dies with
 * SIGSEGV (exit code 139) instead of throwing; encoding raw pixels still
 * appears to work. This affects the Main process and every utilityProcess,
 * including the Library Worker used for image import and thumbnails.
 *
 * Refusing the native Linux backends makes sharp fall back to
 * `@img/sharp-wasm32`, which runs libvips in WebAssembly and has no native GLib
 * to collide with. Linux packages ship that backend instead of the native ones
 * (see forge.config.ts and scripts/verify-package.mjs).
 *
 * Upstream: https://github.com/electron/electron/issues/46323
 */
const SHARP_NATIVE_LINUX = /^@img\/sharp-(?:libvips-)?linux(?:musl)?-[^/]+(?:\/|$)/u;

let hooksInstalled = false;

/**
 * Refuse sharp's native Linux backends in this process when running under
 * Electron, so the first `require('sharp')` loads the WebAssembly build.
 * Hooks are per-thread, so each Electron process (Main, Library Worker and the
 * test runner) must call this from the thread that will load sharp.
 */
export function installLinuxSharpWasm(): void {
  if (hooksInstalled || process.platform !== 'linux' || !process.versions.electron) {
    return;
  }
  hooksInstalled = true;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (SHARP_NATIVE_LINUX.test(specifier)) {
        // Sharp probes for the platform backend with require() inside a try;
        // a MODULE_NOT_FOUND-shaped error makes it continue to the wasm
        // fallback instead of treating this as a broken installation.
        throw Object.assign(new Error(`Cannot find module '${specifier}'`), {
          code: 'MODULE_NOT_FOUND',
        });
      }
      return nextResolve(specifier, context);
    },
  });
}

export function loadSharp(): typeof sharp {
  installLinuxSharpWasm();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('sharp') as typeof sharp;
}
