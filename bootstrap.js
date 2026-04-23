import { loadVaultSecrets } from './vault-loader.js';
import 'dotenv/config';

console.log('[Bootstrap] Loading Vault secrets...');
await loadVaultSecrets();

console.log('[Bootstrap] Starting application...');
// We use dynamic import to ensure all other modules are imported AFTER Vault secrets are loaded
const entryPoint = process.env.ENTRY_POINT || './server.grpc.js';
await import(entryPoint);
