# storage-service
Standalone worker for file storage integration.

### 3. Helm Chart Refactoring (Standardized)
- **Standardized Helpers**: Updated `_helpers.tpl` to use `storage-service` prefixes for all definitions.
- **Values Cleanup**: Removed legacy `TERABOX_*` environment variables and replaced them with `STORAGE_EMAIL`, `STORAGE_PASSWORD`, and `STORAGE_PORT`.
- **Identity Alignment**: Updated `internalCallers` in `values.yaml` to include `marketplace-service` instead of the legacy `media-service`.
- **Authorization Paths**: Cleaned up `authorization-policy.yaml` to use standardized paths and labels.