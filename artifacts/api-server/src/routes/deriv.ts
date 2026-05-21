import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";

const router: IRouter = Router();

/**
 * Tight rate limit on the token-exchange endpoint.
 * 10 attempts per IP per 15 minutes — enough for legitimate retries,
 * too few to brute-force Deriv's token API.
 */
const tokenExchangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please wait a few minutes and try again." },
});

/** Map known hostnames to their Deriv app IDs (fallback only). */
const HOSTNAME_APP_IDS: Record<string, string> = {
  "dbot.deriv.com": "65555",
  "dbot.deriv.be": "65556",
  "dbot.deriv.me": "65557",
  "staging-dbot.deriv.com": "29934",
  "staging-dbot.deriv.be": "29934",
  "staging-dbot.deriv.me": "29934",
  "master.bot-standalone.pages.dev": "64584",
  localhost: "36300",
};

/** Resolve the correct Deriv OAuth base URL from the redirect_uri's hostname. */
const getOAuthBase = (hostname: string): string => {
  if (hostname.includes(".deriv.me")) return "https://oauth.deriv.me";
  if (hostname.includes(".deriv.be")) return "https://oauth.deriv.be";
  return "https://oauth.deriv.com";
};

/**
 * Resolve the client_id to send to Deriv.
 * Priority: DERIV_APP_ID env var (supports both string and numeric IDs) >
 *           hostname-based map > production numeric fallback.
 */
const resolveAppId = (hostname: string): string => {
  if (process.env.DERIV_APP_ID) return process.env.DERIV_APP_ID;
  return HOSTNAME_APP_IDS[hostname] ?? "65555";
};

/**
 * POST /api/deriv/token-exchange
 *
 * Exchanges a PKCE authorization code for Deriv account tokens.
 * The frontend sends { code, code_verifier, redirect_uri } — the backend
 * adds the app_id (kept server-side) and forwards to Deriv's token endpoint.
 *
 * Deriv returns tokens in its acct1/token1/cur1 format, which this route
 * wraps in { tokens: <deriv_response> } for the frontend callback handler.
 */
router.post("/deriv/token-exchange", tokenExchangeLimiter, async (req, res) => {
  const { code, code_verifier, redirect_uri } = req.body ?? {};

  if (
    typeof code !== "string" ||
    !code.trim() ||
    typeof code_verifier !== "string" ||
    !code_verifier.trim() ||
    typeof redirect_uri !== "string" ||
    !redirect_uri.trim()
  ) {
    res.status(400).json({ error: "Missing required fields: code, code_verifier, redirect_uri" });
    return;
  }

  let redirectHostname: string;
  try {
    redirectHostname = new URL(redirect_uri).hostname;
  } catch {
    res.status(400).json({ error: "Invalid redirect_uri" });
    return;
  }

  const appId = resolveAppId(redirectHostname);
  const oauthBase = getOAuthBase(redirectHostname);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: String(appId),
    code,
    code_verifier,
    redirect_uri,
  });

  let derivResponse: Response;
  try {
    derivResponse = await fetch(`${oauthBase}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to reach Deriv token endpoint");
    res.status(502).json({ error: "Failed to reach Deriv token endpoint" });
    return;
  }

  let derivData: unknown;
  try {
    derivData = await derivResponse.json();
  } catch {
    derivData = {};
  }

  if (!derivResponse.ok) {
    req.log.warn({ status: derivResponse.status, derivData }, "Deriv token exchange failed");
    res.status(derivResponse.status).json({ error: "Token exchange rejected by Deriv", detail: derivData });
    return;
  }

  res.json({ tokens: derivData });
});

/**
 * More generous limit for refresh — silent renewals happen frequently
 * in normal usage, but 30 per 15 min still blocks abuse.
 */
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many refresh attempts. Please wait a few minutes and try again." },
});

/**
 * POST /api/deriv/refresh-token
 *
 * Silently renews an expired Deriv session using a refresh_token.
 * The frontend sends { refresh_token } — the backend adds client_id
 * and forwards to Deriv's token endpoint with grant_type=refresh_token.
 *
 * On success returns { tokens: <deriv_response> } in the same shape
 * as /token-exchange so the frontend can reuse the same storage logic.
 * On token rejection returns 401 so the frontend can redirect to login.
 */
router.post("/deriv/refresh-token", refreshLimiter, async (req, res) => {
  const { refresh_token } = req.body ?? {};

  if (typeof refresh_token !== "string" || !refresh_token.trim()) {
    res.status(400).json({ error: "Missing required field: refresh_token" });
    return;
  }

  const appId = process.env.DERIV_APP_ID ?? "65555";
  const oauthBase = getOAuthBase(req.hostname ?? "");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: appId,
    refresh_token,
  });

  let derivResponse: Response;
  try {
    derivResponse = await fetch(`${oauthBase}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to reach Deriv token endpoint (refresh)");
    res.status(502).json({ error: "Failed to reach Deriv token endpoint" });
    return;
  }

  let derivData: unknown;
  try {
    derivData = await derivResponse.json();
  } catch {
    derivData = {};
  }

  if (!derivResponse.ok) {
    const status = derivResponse.status === 400 ? 401 : derivResponse.status;
    req.log.warn({ status: derivResponse.status, derivData }, "Deriv refresh token rejected");
    res.status(status).json({ error: "Refresh token rejected. Please log in again.", detail: derivData });
    return;
  }

  res.json({ tokens: derivData });
});

/**
 * POST /api/deriv/verify-token
 *
 * Validates a stored authToken by calling Deriv's OIDC userinfo endpoint
 * (standard HTTP — no WebSocket needed). Returns:
 *   { valid: true,  loginid, currency, balance } — token is good
 *   { valid: false, reason }                     — token is expired / invalid
 *
 * Called by the frontend at app startup so stale tokens are caught
 * immediately rather than causing silent failures mid-session.
 */
router.post("/deriv/verify-token", async (req, res) => {
  const { token } = req.body ?? {};

  if (typeof token !== "string" || !token.trim()) {
    res.status(400).json({ valid: false, reason: "Missing required field: token" });
    return;
  }

  const oauthBase = getOAuthBase(req.hostname ?? "");

  let infoResponse: Response;
  try {
    infoResponse = await fetch(`${oauthBase}/oauth2/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to reach Deriv userinfo endpoint");
    res.status(502).json({ valid: false, reason: "Could not reach Deriv API" });
    return;
  }

  if (infoResponse.status === 401 || infoResponse.status === 403) {
    res.json({ valid: false, reason: "Token is invalid or expired" });
    return;
  }

  if (!infoResponse.ok) {
    req.log.warn({ status: infoResponse.status }, "Deriv userinfo returned unexpected status");
    res.json({ valid: false, reason: `Deriv returned status ${infoResponse.status}` });
    return;
  }

  let info: Record<string, unknown>;
  try {
    info = (await infoResponse.json()) as Record<string, unknown>;
  } catch {
    res.json({ valid: false, reason: "Invalid response from Deriv userinfo" });
    return;
  }

  res.json({
    valid: true,
    loginid: info.loginid ?? info.sub,
    currency: info.currency,
    balance: info.balance,
  });
});

/**
 * POST /api/deriv/account-switch
 *
 * Validates the target account's token before the frontend commits the switch.
 * Accepts { loginid, token } and calls Deriv's userinfo endpoint with the token.
 * Returns { success: true } so the frontend can safely update authToken +
 * active_loginid in localStorage without touching any live session data.
 *
 * If the token is expired the frontend knows to trigger a full re-login
 * rather than silently switching to a broken account.
 */
router.post("/deriv/account-switch", async (req, res) => {
  const { loginid, token } = req.body ?? {};

  if (typeof loginid !== "string" || !loginid.trim()) {
    res.status(400).json({ success: false, reason: "Missing required field: loginid" });
    return;
  }
  if (typeof token !== "string" || !token.trim()) {
    res.status(400).json({ success: false, reason: "Missing required field: token" });
    return;
  }

  const oauthBase = getOAuthBase(req.hostname ?? "");

  let infoResponse: Response;
  try {
    infoResponse = await fetch(`${oauthBase}/oauth2/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    req.log.error({ err }, "account-switch: failed to reach Deriv userinfo");
    res.status(502).json({ success: false, reason: "Could not reach Deriv API" });
    return;
  }

  if (infoResponse.status === 401 || infoResponse.status === 403) {
    res.json({ success: false, reason: "Token for this account is invalid or expired — please log in again" });
    return;
  }

  if (!infoResponse.ok) {
    res.json({ success: false, reason: `Deriv returned status ${infoResponse.status}` });
    return;
  }

  res.json({ success: true, loginid });
});

/**
 * POST /api/deriv/logout
 *
 * Revokes the user's refresh_token at Deriv's revocation endpoint (RFC 7009).
 * This invalidates the session server-side even before the token expires.
 * The frontend should also clear its localStorage after calling this.
 *
 * Returns 200 whether or not Deriv accepted the revocation — if the token
 * was already expired or invalid there is nothing left to revoke, so we
 * treat it as a successful logout either way.
 */
router.post("/deriv/logout", async (req, res) => {
  const { refresh_token } = req.body ?? {};

  if (typeof refresh_token !== "string" || !refresh_token.trim()) {
    res.status(400).json({ error: "Missing required field: refresh_token" });
    return;
  }

  const appId = process.env.DERIV_APP_ID ?? "65555";
  const oauthBase = getOAuthBase(req.hostname ?? "");

  const body = new URLSearchParams({
    token: refresh_token,
    client_id: appId,
  });

  try {
    const derivResponse = await fetch(`${oauthBase}/oauth2/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!derivResponse.ok) {
      const detail = await derivResponse.text().catch(() => "");
      req.log.warn({ status: derivResponse.status, detail }, "Deriv revocation returned non-OK (treating as success)");
    }
  } catch (err) {
    req.log.error({ err }, "Failed to reach Deriv revocation endpoint — logging out locally anyway");
  }

  res.json({ success: true });
});

export default router;
