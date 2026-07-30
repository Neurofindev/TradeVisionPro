import { streakDayLabel, streakMessage } from "../_shared/streak-policy.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ACCESS_CODE_HASHES = JSON.parse(Deno.env.get("TVP_ACCESS_CODE_HASHES") || "{}") as Record<string, string>;
const RATE_LIMIT_SALT = Deno.env.get("TVP_RATE_LIMIT_SALT") || "tradevisionpro";
const ALLOWED_ORIGINS = new Set(
  (Deno.env.get("TVP_ALLOWED_ORIGINS")
    || "https://neurofindev.github.io,http://127.0.0.1:4173,http://localhost:4173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://neurofindev.github.io",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(request: Request, body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      ...extraHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function constantTimeEqual(left = "", right = "") {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

async function rpc(name: string, parameters: Record<string, unknown>) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(parameters),
  });
  if (!response.ok) {
    const message = await response.text();
    console.error(`RPC ${name} failed (${response.status})`, message.slice(0, 500));
    throw new Error(`RPC ${name} failed`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
}

function decorateStreak(payload: Record<string, unknown>) {
  const streak = (payload.streak || {}) as Record<string, unknown>;
  return {
    ...payload,
    streak: {
      ...streak,
      label: streakDayLabel(streak.currentStreak),
      message: streakMessage(streak.currentStreak, String(streak.event || "incremented")),
    },
  };
}

async function login(request: Request, input: Record<string, unknown>) {
  const code = String(input.code || "");
  if (!/^\d{6}$/.test(code)) {
    return json(request, { ok: false, error: "invalid_credentials" }, 401);
  }

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("cf-connecting-ip")
    || "unknown";
  const clientKey = await sha256(`${RATE_LIMIT_SALT}:${forwarded}`);
  const rateLimit = await rpc("tvp_allow_login_attempt", { p_client_key: clientKey }) as Record<string, unknown>;
  if (!rateLimit?.allowed) {
    const retryAfter = String(rateLimit?.retryAfterSeconds || 900);
    return json(
      request,
      { ok: false, error: "rate_limited", retryAfterSeconds: Number(retryAfter) },
      429,
      { "Retry-After": retryAfter },
    );
  }

  const codeHash = await sha256(code);
  const profileKey = Object.entries(ACCESS_CODE_HASHES)
    .find(([, expectedHash]) => constantTimeEqual(codeHash, expectedHash))?.[0];
  if (!profileKey) {
    return json(request, { ok: false, error: "invalid_credentials" }, 401);
  }

  const token = randomToken();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  const result = await rpc("tvp_login_and_update_streak", {
    p_profile_key: profileKey,
    p_session_hash: tokenHash,
    p_session_expires_at: expiresAt,
  }) as Record<string, unknown>;

  if (!result?.ok) return json(request, { ok: false, error: "invalid_credentials" }, 401);
  await rpc("tvp_clear_login_attempt", { p_client_key: clientKey });

  return json(request, decorateStreak({ ...result, sessionToken: token, expiresAt }));
}

async function sessionSnapshot(request: Request) {
  const token = bearerToken(request);
  if (!token) return json(request, { ok: false, error: "invalid_session" }, 401);
  const result = await rpc("tvp_session_snapshot", { p_session_hash: await sha256(token) }) as Record<string, unknown>;
  if (!result?.ok) return json(request, { ok: false, error: "invalid_session" }, 401);
  return json(request, decorateStreak(result));
}

async function setPreference(request: Request, input: Record<string, unknown>) {
  const token = bearerToken(request);
  if (!token || typeof input.rewardSoundEnabled !== "boolean") {
    return json(request, { ok: false, error: "invalid_request" }, 400);
  }
  const result = await rpc("tvp_set_reward_sound", {
    p_session_hash: await sha256(token),
    p_enabled: input.rewardSoundEnabled,
  }) as Record<string, unknown>;
  if (!result?.ok) return json(request, { ok: false, error: "invalid_session" }, 401);
  return json(request, result);
}

async function logout(request: Request) {
  const token = bearerToken(request);
  if (token) await rpc("tvp_logout", { p_session_hash: await sha256(token) });
  return json(request, { ok: true });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { ok: false, error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(request, { ok: false, error: "service_unavailable" }, 503);

  try {
    const input = await request.json() as Record<string, unknown>;
    switch (input.action) {
      case "login":
        return await login(request, input);
      case "session":
        return await sessionSnapshot(request);
      case "preference":
        return await setPreference(request, input);
      case "logout":
        return await logout(request);
      default:
        return json(request, { ok: false, error: "invalid_request" }, 400);
    }
  } catch (error) {
    console.error("TradeVisionPro API error", error);
    return json(request, { ok: false, error: "service_unavailable" }, 503);
  }
});
