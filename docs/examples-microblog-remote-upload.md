# Microblog Example: Remote Upload Adapter

This document shows how to run the canonical microblog example against a standalone remote upload adapter instead of the local preview upload endpoint.

Relevant files:
- schema: `apps/example/microblog.schema.json`
- standalone adapter: `examples/upload-adapters/foc-remote-adapter.mjs`

## 1. Start a remote upload adapter

Local-disk example:

```bash
HOST=127.0.0.1 \
PORT=8788 \
TH_UPLOAD_ADAPTER_MODE=local \
TH_UPLOAD_ENDPOINT_PATH=/api/upload \
TH_UPLOAD_STATUS_PATH=/api/upload/status \
TH_UPLOAD_PUBLIC_BASE_URL=http://127.0.0.1:8788 \
node examples/upload-adapters/foc-remote-adapter.mjs
```

Filecoin Onchain Cloud process-runner example:

```bash
HOST=127.0.0.1 \
PORT=8788 \
TH_UPLOAD_ADAPTER_MODE=foc-process \
TH_UPLOAD_ENDPOINT_PATH=/api/upload \
TH_UPLOAD_STATUS_PATH=/api/upload/status \
TH_UPLOAD_PUBLIC_BASE_URL=http://127.0.0.1:8788 \
TH_UPLOAD_FOC_COMMAND="npx -y foc-cli" \
TH_UPLOAD_FOC_CHAIN=314159 \
TH_UPLOAD_FOC_COPIES=2 \
node examples/upload-adapters/foc-remote-adapter.mjs
```

## 2. Build the microblog app against that remote adapter

```bash
TH_UPLOAD_RUNNER=remote \
TH_UPLOAD_PROVIDER=foc \
TH_UPLOAD_REMOTE_ENDPOINT_URL=http://127.0.0.1:8788/api/upload \
TH_UPLOAD_REMOTE_STATUS_URL=http://127.0.0.1:8788/api/upload/status \
th build apps/example/microblog.schema.json --out out/microblog
```

This emits:
- `manifest.extensions.uploads.runnerMode = "remote"`
- `manifest.extensions.uploads.endpointUrl = "http://127.0.0.1:8788/api/upload"`
- `manifest.extensions.uploads.statusUrl = "http://127.0.0.1:8788/api/upload/status"`

## 3. Preview the generated app

```bash
th preview out/microblog
```

The generated UI now uses the remote adapter metadata from the manifest. Local preview does not need to host the upload runner itself in this mode.

## Operational guidance

Use `local` adapter mode when:
- you want a simple self-hosted prototype
- you want to validate the remote-runner contract without funding FOC

Use `foc-process` adapter mode when:
- you want the generated app to behave like production Filecoin-backed image uploads
- you are comfortable managing the adapter wallet/payment account on the adapter host

Use the built-in preview upload endpoint instead of a standalone adapter when:
- you are doing local-only UI iteration
- you do not need a separate upload service topology yet
