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

export default router;
