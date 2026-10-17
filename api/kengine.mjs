/**
 * K.ENGINE API para Vercel Serverless.
 * Expone el mismo contrato HTTP que server.js (health/models/chat/config).
 *
 * Nota: el bridge WebLLM (SSE persistente + pestaña del navegador) necesita un
 * proceso Node de larga duración. En Vercel serverless NO hay pestaña unida al
 * servidor: /chat con backend webllm responde 503 explicativo.
 * Configura KENGINE_BASE_URL + KENGINE_MODEL para openai-compatible, o usa
 * `node server.js` en un host persistente para el bridge completo.
 */

import { KERNEL_PERSONALITY, getSystemPrompt } from "../src/engine/personality.js";

const VERSION = "1.3.0";
function systemPromptFor(c) {
  return getSystemPrompt(c.model || "");
}

const WEBLLM_MODELS = [
  { id: "llama-3.2-1b", webllm_id: "Llama-3.2-1B-Instruct-q4f16_1-MLC" },
  { id: "qwen2.5-0.5b", webllm_id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC" },
  { id: "qwen2.5-1.5b", webllm_id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC" },
  { id: "llama-3.2-3b", webllm_id: "Llama-3.2-3B-Instruct-q4f16_1-MLC" },
];

function env(name, fallback = "") {
  return (process.env[name] || fallback).trim();
}

function cfg() {
  const baseUrl = env("KENGINE_BASE_URL").replace(/\/+$/, "");
  const model = env("KENGINE_MODEL");
  const apiKey = env("KENGINE_API_KEY");
  const authToken = env("KENGINE_AUTH_TOKEN");
  const defaultBackend = env("KENGINE_BACKEND", "auto");
  const maxTokens = Number(env("KENGINE_MAX_TOKENS", "1024")) || 1024;
  const timeoutMs = Number(env("KENGINE_TIMEOUT_MS", "120000")) || 120000;
  const cors = env("KENGINE_CORS_ORIGIN", "*");
  return { baseUrl, model, apiKey, authToken, defaultBackend, maxTokens, timeoutMs, cors };
}

function corsHeaders(req, c) {
  const origin = req.headers.origin || req.headers.Origin || "";
  const allowed = c.cors === "*" || !c.cors || c.cors.split(",").map((s) => s.trim()).includes(origin);
  const h = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    "Cache-Control": "no-store",
  };
  if (c.cors === "*") {
    h["Access-Control-Allow-Origin"] = origin || "*";
    if (origin) h["Vary"] = "Origin";
  } else if (allowed && origin) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Vary"] = "Origin";
  }
  return h;
}

function send(res, req, c, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders(req, c),
  });
  res.end(body);
}

function authorized(req, c) {
  if (!c.authToken) return true;
  const got = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  return got === c.authToken;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on("data", (ch) => {
      n += ch.length;
      if (n > 512_000) {
        reject(Object.assign(new Error("Cuerpo demasiado grande"), { status: 413, code: "body_too_large" }));
        return;
      }
      chunks.push(ch);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  try {
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object" || Array.isArray(j)) {
      throw Object.assign(new Error("El cuerpo debe ser un objeto JSON"), { status: 400, code: "invalid_body" });
    }
    return j;
  } catch (e) {
    if (e.status) throw e;
    throw Object.assign(new Error("JSON inválido"), { status: 400, code: "invalid_json" });
  }
}

function maskKey(k) {
  if (!k) return "";
  return k.length > 8 ? k.slice(0, 3) + "…" + k.slice(-4) : "••••";
}

function openaiConfigured(c) {
  return Boolean(c.baseUrl && c.model);
}

async function listRemoteModels(c) {
  const h = { "Content-Type": "application/json" };
  if (c.apiKey) h.Authorization = "Bearer " + c.apiKey;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), Math.min(c.timeoutMs, 15000));
  try {
    const r = await fetch(c.baseUrl + "/models", { headers: h, signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return { ok: false, error: "HTTP " + r.status, models: [] };
    const j = await r.json();
    const models = Array.isArray(j.data) ? j.data.map((m) => m.id).filter(Boolean) : [];
    return { ok: true, models };
  } catch (e) {
    clearTimeout(t);
    return { ok: false, error: String(e.message || e), models: [] };
  }
}

async function openaiComplete(c, messages) {
  const h = { "Content-Type": "application/json" };
  if (c.apiKey) h.Authorization = "Bearer " + c.apiKey;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), c.timeoutMs);
  try {
    const r = await fetch(c.baseUrl + "/chat/completions", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ model: c.model, messages, stream: false, max_tokens: c.maxTokens }),
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw Object.assign(new Error("Proveedor " + r.status + (txt ? ": " + txt.slice(0, 200) : "")), {
        status: 502,
        code: "provider_error",
      });
    }
    const j = await r.json();
    const text = j.choices?.[0]?.message?.content;
    if (typeof text !== "string") {
      throw Object.assign(new Error("Respuesta del proveedor sin content"), { status: 502, code: "provider_empty" });
    }
    return text;
  } catch (e) {
    clearTimeout(t);
    if (e.status) throw e;
    if (e.name === "AbortError") {
      throw Object.assign(new Error("Timeout del proveedor"), { status: 504, code: "provider_timeout" });
    }
    throw Object.assign(new Error(String(e.message || e)), { status: 502, code: "provider_error" });
  }
}

async function handleModels(req, res, c) {
  const models = WEBLLM_MODELS.map((m) => ({
    id: m.id,
    backend: "webllm",
    webllm_id: m.webllm_id,
    status: "no_browser_connected",
    note: "En Vercel serverless no hay bridge a una pestaña; carga el modelo en la UI o usa openai-compatible.",
  }));
  const backends = {
    webllm: { available: true, browser_required: true },
    "openai-compatible": {
      configured: openaiConfigured(c),
      base_url: c.baseUrl || null,
      model: c.model || null,
    },
  };
  if (openaiConfigured(c)) {
    const remote = await listRemoteModels(c);
    backends["openai-compatible"].provider_check = remote.ok ? "ok" : remote.error;
    if (remote.ok && remote.models.length) {
      models.push({
        id: c.model,
        backend: "openai-compatible",
        status: "ready",
        provider_models_sample: remote.models.slice(0, 8),
      });
    } else {
      models.push({
        id: c.model || "openai-compatible",
        backend: "openai-compatible",
        status: remote.ok ? "ready" : "error",
        error: remote.error || null,
      });
    }
  }
  send(res, req, c, 200, { models, backends, engine: "K.ENGINE", version: VERSION });
}

async function handleChat(req, res, c) {
  if (!openaiConfigured(c)) {
    return send(res, req, c, 503, {
      error: "No hay backend de chat configurado. Define KENGINE_BASE_URL y KENGINE_MODEL, o usa WebLLM en la UI.",
      code: "no_backend",
    });
  }
  const body = await readJson(req);
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return send(res, req, c, 400, { error: "Falta message", code: "invalid_request" });
  }
  if (message.length > 8000) {
    return send(res, req, c, 400, { error: "message demasiado largo", code: "invalid_request" });
  }
  const history = Array.isArray(body.history) ? body.history : [];
  const messages = [
    { role: "system", content: systemPromptFor(c) },
    ...history
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) })),
    { role: "user", content: message },
  ];
  try {
    const text = await openaiComplete(c, messages);
    return send(res, req, c, 200, {
      response: text,
      model: c.model,
      backend: "openai-compatible",
      context: { used_messages: messages.length - 1, dropped_messages: 0 },
    });
  } catch (e) {
    return send(res, req, c, e.status || 502, {
      error: String(e.message || e),
      code: e.code || "chat_failed",
    });
  }
}

async function handleConfig(req, res, c) {
  if (req.method === "GET") {
    return send(res, req, c, 200, {
      backend: c.defaultBackend,
      base_url: c.baseUrl || "",
      model: c.model || "",
      api_key_set: Boolean(c.apiKey),
      api_key: maskKey(c.apiKey),
      env: "vercel",
      auth_required: Boolean(c.authToken),
      personality: KERNEL_PERSONALITY.name,
    });
  }
  return send(res, req, c, 403, {
    error: "Configuración remota no permitida en Vercel; usa variables de entorno.",
    code: "config_readonly",
  });
}

export default async function handler(req, res) {
  const c = cfg();
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(req, c));
    return res.end();
  }
  if (!authorized(req, c)) {
    return send(res, req, c, 401, { error: "No autorizado", code: "unauthorized" });
  }
  const url = new URL(req.url || "/", "http://localhost");
  let path = url.pathname.replace(/\/+$/, "") || "/";
  if (path.startsWith("/api")) path = path.slice(4) || "/";

  try {
    if (path === "/health" || path === "/") {
      return send(res, req, c, 200, {
        status: "ok",
        engine: "K.ENGINE",
        version: VERSION,
        platform: "vercel-serverless",
        personality: KERNEL_PERSONALITY.name,
      });
    }
    if (path === "/models") return handleModels(req, res, c);
    if (path === "/chat" && req.method === "POST") return handleChat(req, res, c);
    if (path === "/config") return handleConfig(req, res, c);
    return send(res, req, c, 404, { error: "No encontrado", code: "not_found" });
  } catch (e) {
    return send(res, req, c, e.status || 500, {
      error: String(e.message || e),
      code: e.code || "internal_error",
    });
  }
}
