import { createPluginTrustedHostHandler } from './plugin-trusted-host';
import { installLinuxSharpWasm } from '../shared/load-sharp';

// Trusted plugins import their own modules in this process. If one loads sharp,
// Electron on Linux must get the WebAssembly backend instead of the native one.
installLinuxSharpWasm();

const parentPort = process.parentPort;
if (parentPort === undefined) {
  throw new Error('The Trusted Plugin Host Utility must be started by Electron Main.');
}
const processLifetime = setInterval(() => {}, 60 * 60_000);
const handler = createPluginTrustedHostHandler({
  postMessage: (message) => parentPort.postMessage(message),
});
parentPort.on('message', (event) => handler.handle(event.data));
setImmediate(() => parentPort.postMessage({ type: 'plugin-trusted.ready' }));
process.once('exit', () => {
  clearInterval(processLifetime);
  handler.dispose();
});
