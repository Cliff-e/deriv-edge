import { Router, type IRouter } from "express";
import { ExchangeTokenBody, GetMeHeader } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/auth/token", async (req, res) => {
  const parsed = ExchangeTokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { code, codeVerifier, redirectUri, clientId } = parsed.data;

  try {
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    });

    const tokenRes = await fetch("https://auth.deriv.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      req.log.warn({ status: tokenRes.status, body: text }, "Token exchange failed");
      res.status(401).json({ error: "Token exchange failed" });
      return;
    }

    const data = (await tokenRes.json()) as {
      access_token?: string;
      token_type?: string;
      expires_in?: number;
      scope?: string;
    };

    res.json({
      accessToken: data.access_token ?? "",
      tokenType: data.token_type ?? "Bearer",
      expiresIn: data.expires_in ?? null,
      scope: data.scope ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Token exchange error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/auth/me", async (req, res) => {
  const parsed = GetMeHeader.safeParse(req.headers);
  if (!parsed.success) {
    res.status(401).json({ error: "Missing authorization header" });
    return;
  }

  const token = parsed.data.authorization;

  try {
    const derivRes = await fetch(
      "https://api.deriv.com/api/v1/accounts?fields=loginid,email,fullname,balance,currency,country",
      {
        headers: { Authorization: token },
      },
    );

    if (!derivRes.ok) {
      const text = await derivRes.text();
      req.log.warn({ status: derivRes.status, body: text }, "Deriv API error");
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    const data = (await derivRes.json()) as {
      loginid?: string;
      email?: string;
      fullname?: string;
      balance?: number;
      currency?: string;
      country?: string;
    };

    res.json({
      loginid: data.loginid ?? "",
      email: data.email ?? "",
      fullname: data.fullname ?? null,
      balance: data.balance ?? null,
      currency: data.currency ?? null,
      country: data.country ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Get me error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
