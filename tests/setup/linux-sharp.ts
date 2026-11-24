import { installLinuxSharpWasm } from '../../src/shared/load-sharp';

// Tests run with Electron's Node runtime on every platform. On Linux that
// process links the system GLib, so a direct `import sharp` would load the
// native Linux backend and SIGSEGV on the first decoded image. Install the
// same resolver refusal the application uses before any test module loads
// sharp (worker threads receive their own copy of this setup).
installLinuxSharpWasm();
