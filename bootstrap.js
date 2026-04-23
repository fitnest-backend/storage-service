import { loadVaultSecrets } from './vault-loader.js';
import 'dotenv/config';

async function bootstrap() {
    try {
        console.log('[Bootstrap] Initializing...');
        await loadVaultSecrets();
        
        console.log('[Bootstrap] Secrets loaded. Importing application...');
        const entryPoint = process.env.ENTRY_POINT || './server.grpc.js';
        await import(entryPoint);
    } catch (err) {
        console.error('[Bootstrap] Failed to start application:', err.message);
        process.exit(1);
    }
}

bootstrap();
