import vault from 'node-vault';

async function loadVaultSecrets() {
    if (!process.env.VAULT_ROLE_ID || !process.env.VAULT_SECRET_ID) {
        console.log('Vault credentials not found, skipping Vault secret loading.');
        return;
    }

    const options = {
        apiVersion: 'v1',
        endpoint: process.env.VAULT_ADDR || 'http://10.0.0.4:8200',
    };

    const v = vault(options);

    try {
        const result = await v.approleLogin({
            role_id: process.env.VAULT_ROLE_ID,
            secret_id: process.env.VAULT_SECRET_ID,
        });

        v.token = result.auth.client_token;

        const serviceName = 'storage-backend';
        const env = process.env.VAULT_ENV || 'development';
        const path = `secrets/data/${serviceName}/${env}`;

        const secrets = await v.read(path);
        const data = secrets.data.data;

        for (const [key, value] of Object.entries(data)) {
            process.env[key] = value;
            console.log(`Loaded ${key} from Vault`);
        }
    } catch (err) {
        console.error('Error loading secrets from Vault:', err.message);
    }
}

export { loadVaultSecrets };
