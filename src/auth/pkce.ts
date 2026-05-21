/**
 * PKCE (Proof Key for Code Exchange) utilities for Deriv OAuth2 PKCE flow.
 * All operations use the Web Crypto API — no external dependencies required.
 */

/**
 * Encodes a Uint8Array as a URL-safe base64 string (no padding).
 */
const base64UrlEncode = (buffer: Uint8Array): string => {
    let binary = '';
    buffer.forEach(byte => (binary += String.fromCharCode(byte)));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

/**
 * Generates a cryptographically secure code verifier (43–128 chars, URL-safe).
 * RFC 7636 §4.1
 */
export const generateCodeVerifier = (): string => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return base64UrlEncode(array);
};

/**
 * Derives a S256 code challenge from the verifier.
 * RFC 7636 §4.2
 */
export const generateCodeChallenge = async (verifier: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return base64UrlEncode(new Uint8Array(digest));
};

/**
 * Generates a cryptographically secure opaque state value to prevent CSRF.
 */
export const generateState = (): string => {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return base64UrlEncode(array);
};
