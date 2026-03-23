# Upload Adapter Examples

## `foc-remote-adapter.mjs`

Standalone Node upload adapter that speaks the same request/response contract used by generated Token Host UIs.

It supports:
- `local` mode
  - stores files on disk
  - returns absolute URLs from the adapter service
- `foc-process` mode
  - shells out to `foc-cli upload --format json`
  - returns normalized Filecoin Onchain Cloud upload metadata

### Start it

```bash
HOST=127.0.0.1 \
PORT=8788 \
TH_UPLOAD_ADAPTER_MODE=local \
TH_UPLOAD_ENDPOINT_PATH=/api/upload \
TH_UPLOAD_STATUS_PATH=/api/upload/status \
TH_UPLOAD_PUBLIC_BASE_URL=http://127.0.0.1:8788 \
node examples/upload-adapters/foc-remote-adapter.mjs
```

### Point a generated app at it

```bash
TH_UPLOAD_RUNNER=remote \
TH_UPLOAD_REMOTE_ENDPOINT_URL=http://127.0.0.1:8788/api/upload \
TH_UPLOAD_REMOTE_STATUS_URL=http://127.0.0.1:8788/api/upload/status \
th build apps/example/microblog.schema.json --out out/microblog
```

### Local-mode env

- `TH_UPLOAD_ADAPTER_MODE=local`
- `TH_UPLOAD_LOCAL_DIR`
  directory root for stored uploads
- `TH_UPLOAD_ENDPOINT_PATH`
  upload POST path
- `TH_UPLOAD_STATUS_PATH`
  GET/HEAD status path
- `TH_UPLOAD_PUBLIC_BASE_URL`
  absolute base URL used to construct returned file URLs
- `TH_UPLOAD_ACCEPT`
  comma-separated MIME allowlist
- `TH_UPLOAD_MAX_BYTES`
  request size limit

### FOC process-mode env

- `TH_UPLOAD_ADAPTER_MODE=foc-process`
- `TH_UPLOAD_FOC_COMMAND`
  default `npx -y foc-cli`
- `TH_UPLOAD_FOC_CHAIN`
  default `314159`
- `TH_UPLOAD_FOC_COPIES`
- `TH_UPLOAD_FOC_WITH_CDN`

### Response contract

Status response:

```json
{
  "ok": true,
  "enabled": true,
  "provider": "filecoin_onchain_cloud",
  "runnerMode": "foc-process",
  "endpointUrl": "https://uploads.example.com/api/upload",
  "statusUrl": "https://uploads.example.com/api/upload/status",
  "accept": ["image/png", "image/jpeg"],
  "maxBytes": 10485760
}
```

Upload response:

```json
{
  "ok": true,
  "upload": {
    "url": "https://... or http://.../uploads/...",
    "cid": null,
    "size": 12345,
    "provider": "local_file",
    "runnerMode": "local",
    "contentType": "image/png",
    "metadata": {}
  }
}
```
