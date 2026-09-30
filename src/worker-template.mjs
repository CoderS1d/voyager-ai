const HTML = __VOYAGER_HTML__;

const MODELS = {
  "Nemotron 3.5 Lightning": {
    id: "nvidia/nemotron-3.5-lightning-30b-a3b",
    temperature: 1,
    top_p: 0.95,
    max_tokens: 4096,
    chat_template_kwargs: { enable_thinking: false }
  },
  "Nemotron 3 Ultra": {
    id: "nvidia/nemotron-3-ultra-550b-a55b",
    temperature: 0.6,
    top_p: 0.95,
    max_tokens: 16384,
    chat_template_kwargs: { enable_thinking: false }
  },
  "Nemotron 3 Nano Omni": {
    id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    temperature: 0.6,
    top_p: 0.95,
    max_tokens: 8192,
    reasoning_budget: 4096
  },
  "Llama 3.2 Vision": {
    id: "meta/llama-3.2-90b-vision-instruct",
    temperature: 0.4,
    top_p: 0.9,
    max_tokens: 4096
  }
};

const SYSTEM = `You are BOG AI, a careful personal AI workspace assistant. Help with coding, study, research, planning, and day-to-day work. Be direct, practical, and honest about uncertainty. Never claim to have sent email, changed a calendar, or modified an external system unless an approved tool confirms it.`;

const securityHeaders = {
  "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; worker-src 'self' blob: https://cdn.jsdelivr.net; img-src 'self' data: https:; media-src 'self' data: blob:; connect-src 'self' https://integrate.api.nvidia.com https://cdn.jsdelivr.net; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), geolocation=(), payment=()"
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...securityHeaders, ...headers }
  });
}

function cleanContent(content) {
  if (typeof content === "string") return content.slice(0, 250000);
  if (!Array.isArray(content)) throw new Error("Message content must be text or a supported attachment list.");
  return content.slice(0, 8).map((part) => {
    if (!part || typeof part !== "object") throw new Error("Invalid attachment part.");
    if (part.type === "text") return { type: "text", text: String(part.text || "").slice(0, 200000) };
    if (["image_url", "audio_url", "video_url"].includes(part.type)) {
      const key = part.type;
      const url = part[key]?.url;
      if (typeof url !== "string" || (!url.startsWith("data:") && !url.startsWith("https://"))) throw new Error("Attachment URL must be a data URL or HTTPS URL.");
      if (url.length > 7_500_000) throw new Error("An attachment is too large. Use files under 5 MB.");
      return { type: part.type, [key]: { url } };
    }
    throw new Error(`Unsupported attachment type: ${part.type || "unknown"}`);
  });
}

function cleanMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 12) throw new Error("Provide between 1 and 12 messages.");
  return messages.map((message) => {
    if (!message || !["user", "assistant"].includes(message.role)) throw new Error("Invalid message role.");
    return { role: message.role, content: cleanContent(message.content) };
  });
}

async function chat(request, env) {
  if (!env.NVIDIA_API_KEY) return json({ error: "NVIDIA_API_KEY is not configured yet. Add it as a deployment secret, then try again." }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
  const config = MODELS[body.model];
  if (!config) return json({ error: "Choose one of the supported NVIDIA models." }, 400);
  let messages;
  try { messages = [{ role: "system", content: SYSTEM }, ...cleanMessages(body.messages)]; }
  catch (error) { return json({ error: error.message }, 400); }

  const payload = { model: config.id, messages, stream: true, ...config };
  delete payload.id;
  let upstream;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    upstream = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: { "authorization": `Bearer ${env.NVIDIA_API_KEY}`, "content-type": "application/json", "accept": "text/event-stream" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") return json({ error: "NVIDIA NIM took too long to respond. Try again or choose another model." }, 504);
    return json({ error: "BOG AI could not reach NVIDIA NIM. Try again shortly." }, 502);
  } finally {
    clearTimeout(timeout);
  }

  const raw = await upstream.text();
  if (!upstream.ok) {
    let data;
    try { data = JSON.parse(raw); } catch { data = null; }
    const message = data?.error?.message || data?.detail || `NVIDIA NIM returned ${upstream.status}.`;
    return json({ error: String(message).slice(0, 800) }, upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502);
  }
  let content = "";
  let usage = null;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const value = line.slice(5).trim();
    if (!value || value === "[DONE]") continue;
    try {
      const chunk = JSON.parse(value);
      content += chunk?.choices?.[0]?.delta?.content || "";
      usage = chunk?.usage || usage;
    } catch {}
  }
  if (!content) {
    try {
      const data = JSON.parse(raw);
      content = data?.choices?.[0]?.message?.content || "";
      usage = data?.usage || null;
    } catch {}
  }
  if (!content) {
    const retryController = new AbortController();
    const retryTimeout = setTimeout(() => retryController.abort(), 60_000);
    try {
      const retryResponse = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: { "authorization": `Bearer ${env.NVIDIA_API_KEY}`, "content-type": "application/json", "accept": "application/json" },
        body: JSON.stringify({ ...payload, stream: false }),
        signal: retryController.signal
      });
      const retryData = await retryResponse.json().catch(() => null);
      if (retryResponse.ok) {
        content = retryData?.choices?.[0]?.message?.content || "";
        usage = retryData?.usage || usage;
      }
    } catch {} finally {
      clearTimeout(retryTimeout);
    }
  }
  if (!content) return json({ error: "NVIDIA NIM returned an empty response." }, 502);
  return json({ content, model: config.id, usage });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(HTML, { headers: { "content-type": "text/html; charset=utf-8", ...securityHeaders } });
    }
    if (request.method === "GET" && url.pathname === "/api/health") {
      return json({ ok: true, configured: Boolean(env.NVIDIA_API_KEY), models: Object.keys(MODELS) });
    }
    if (request.method === "POST" && url.pathname === "/api/chat") return chat(request, env);
    return json({ error: "Not found" }, 404);
  }
};
