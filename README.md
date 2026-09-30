# Voyager AI

A private, Odysseus-inspired AI workspace powered by NVIDIA NIM. It supports everyday chat, coding, deep reasoning, image understanding, and multimodal file input.

## Included models

- `nvidia/nemotron-3.5-lightning-30b-a3b` — fast everyday work and agent tasks
- `nvidia/nemotron-3-ultra-550b-a55b` — deep reasoning, coding, and long-context planning
- `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` — image, audio, video, OCR, and transcription
- `meta/llama-3.2-90b-vision-instruct` — image reasoning

## Configure NVIDIA

1. Sign in at [NVIDIA Build](https://build.nvidia.com/).
2. Open a model page and choose **Generate API Key**.
3. Add the key to your deployment as a secret named `NVIDIA_API_KEY`.
4. Never paste the key into `index.html`, commit it to GitHub, or prefix it with `NEXT_PUBLIC_`/`VITE_`.

For local development, copy `.env.example` to `.dev.vars`, replace the placeholder, and keep `.dev.vars` uncommitted.

## Build and check

```sh
npm run build
npm run check
```

The Cloudflare-compatible Worker is generated at `dist/server/index.js`. With no API key, `/api/health` still works and `/api/chat` returns a safe setup message.

## Integrations roadmap

Calendar and email buttons are intentionally connection surfaces only. A production integration should use OAuth, encrypted server-side tokens, explicit approval before sending messages or changing events, and a full audit log.
