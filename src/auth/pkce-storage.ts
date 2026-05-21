/**
 * sessionStorage helpers for the PKCE code_verifier and state values.
 * sessionStorage is preferred over localStorage because values are cleared
 * when the tab is closed, limiting the exposure window.
 */

const PKCE_VERIFIER_KEY = 'deriv_pkce_code_verifier';
const PKCE_STATE_KEY = 'deriv_pkce_state';

export const storePkceVerifier = (verifier: string): void => {
    sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
};

export const getPkceVerifier = (): string | null => {
    return sessionStorage.getItem(PKCE_VERIFIER_KEY);
};

export const clearPkceVerifier = (): void => {
    sessionStorage.removeItem(PKCE_VERIFIER_KEY);
};

export const storePkceState = (state: string): void => {
    sessionStorage.setItem(PKCE_STATE_KEY, state);
};

export const getPkceState = (): string | null => {
    return sessionStorage.getItem(PKCE_STATE_KEY);
};

export const clearPkceState = (): void => {
    sessionStorage.removeItem(PKCE_STATE_KEY);
};
