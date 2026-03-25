# Microblog Example: Netlify Background Uploads

This document shows how to generate the canonical microblog example so image uploads run through Netlify Background Functions and Filecoin Onchain Cloud instead of a VPS-hosted upload process.

Relevant files:
- schema: `apps/example/microblog.schema.json`
- generated Netlify artifacts: `out/microblog/netlify.toml`, `out/microblog/netlify/functions/`

## 1. Build the microblog app

```bash
th build apps/example/microblog.schema.json --chain filecoin_calibration --out out/microblog
```

Because the schema includes:

```json
{
  "app": {
    "deploy": {
      "netlify": {
        "uploads": {
          "provider": "filecoin_onchain_cloud",
          "runner": "background-function"
        }
      }
    }
  }
}
```

the build emits:
- `out/microblog/netlify.toml`
- `out/microblog/netlify/functions/tokenhost-upload-start.mjs`
- `out/microblog/netlify/functions/tokenhost-upload-status.mjs`
- `out/microblog/netlify/functions/tokenhost-upload-worker-background.mjs`
- `out/microblog/NETLIFY-UPLOADS.md`

The generated manifest is also wired so the browser upload client talks to:
- `POST /__tokenhost/upload`
- `GET /__tokenhost/upload-status?jobId=...`

## 2. Set Netlify environment variables

Set these in Netlify with **Functions** scope:

- `TH_UPLOAD_FOC_PRIVATE_KEY`
- `TH_UPLOAD_FOC_CHAIN=314159`
- `TH_UPLOAD_FOC_COPIES=1`

Optional:

- `TH_UPLOAD_FOC_COMMAND=npx -y foc-cli`
- `TH_UPLOAD_FOC_WITH_CDN=true`
- `TH_UPLOAD_FOC_DEBUG=true`

Important:
- runtime secrets must come from Netlify environment variables
- do not put the private key in `netlify.toml`

## 3. Deploy to Netlify

Deploy the generated build root so Netlify sees:
- `ui-site/` as the publish directory
- `netlify/functions/` as the functions directory

The generated `netlify.toml` already configures those paths and the upload redirects.

## 4. Expected runtime flow

1. Browser uploads file bytes to `POST /__tokenhost/upload`
2. Start function stores the request in Netlify Blobs and returns `202` with `jobId`
3. Netlify background worker runs `foc-cli upload`
4. Worker stores success or failure result in Netlify Blobs
5. Browser polls `/__tokenhost/upload-status?jobId=...` until complete

## Current status

This generated target is meant to remove the VPS requirement for FOC uploads.

What is implemented in Token Host now:
- schema/build support for a Netlify upload deployment target
- generated Netlify functions scaffolding
- manifest/runtime wiring compatible with the existing async browser upload client

What still needs real-world validation:
- Netlify runtime compatibility for `foc-cli`
- final deploy ergonomics and any provider-specific edge cases
