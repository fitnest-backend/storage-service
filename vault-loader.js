import vault from 'node-vault';

async function loadVaultSecrets() {
    console.log('[Vault] Starting secret loading process...');
    
    if (!process.env.VAULT_ROLE_ID || !process.env.VAULT_SECRET_ID) {
        console.error('[Vault] Critical Error: VAULT_ROLE_ID or VAULT_SECRET_ID not found in environment.');
        console.log('[Vault] Current Environment Keys:', Object.keys(process.env));
        throw new Error('Vault credentials missing');
    }

    const endpoint = process.env.VAULT_ADDR || 'http://10.0.0.4:8200';
    console.log(`[Vault] Connecting to ${endpoint}...`);

    const v = vault({
        apiVersion: 'v1',
        endpoint: endpoint,
    });

    try {
        console.log(`[Vault] Attempting AppRole login with RoleID: ${process.env.VAULT_ROLE_ID.substring(0, 5)}...`);
        const result = await v.approleLogin({
            role_id: process.env.VAULT_ROLE_ID,
            secret_id: process.env.VAULT_SECRET_ID,
        });

        v.token = result.auth.client_token;
        console.log('[Vault] Login successful.');

        const serviceName = 'storage-backend';
        const env = process.env.VAULT_ENV || 'development';
        const path = `secrets/data/${serviceName}/${env}`;
        console.log(`[Vault] Reading secrets from ${path}...`);

        const secrets = await v.read(path);
        const data = secrets.data.data;

        const keys = Object.keys(data);
        for (const [key, value] of Object.entries(data)) {
            process.env[key] = value;
        }
        console.log(`[Vault] Successfully loaded ${keys.length} secrets: ${keys.join(', ')}`);
        
    } catch (err) {
        console.error('[Vault] Fatal error during secret loading:', err.message);
        if (err.response) {
            console.error('[Vault] Response status:', err.response.statusCode);
            console.error('[Vault] Response body:', JSON.stringify(err.response.body));
        }
        throw err; // Re-throw to prevent app from starting with bad config
    }
}

export { loadVaultSecrets };
