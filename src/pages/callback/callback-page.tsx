import React, { useEffect, useState } from 'react';
import Cookies from 'js-cookie';
import { clearPkceState, clearPkceVerifier, getPkceState, getPkceVerifier } from '@/auth/pkce-storage';
import { REFRESH_TOKEN_KEY, storeTokenExpiry } from '@/auth/refresh-token';
import { crypto_currencies_display_order, fiat_currencies_display_order } from '@/components/shared';
import { generateDerivApiInstance } from '@/external/bot-skeleton/services/api/appId';
import { observer as globalObserver } from '@/external/bot-skeleton/utils/observer';
import useTMB from '@/hooks/useTMB';
import { clearAuthData } from '@/utils/auth-utils';
import { Callback } from '@deriv-com/auth-client';
import { Button } from '@deriv-com/ui';

/**
 * Gets the selected currency or falls back to appropriate defaults
 */
const getSelectedCurrency = (
    tokens: Record<string, string>,
    clientAccounts: Record<string, any>,
    state: any
): string => {
    const getQueryParams = new URLSearchParams(window.location.search);
    const currency =
        (state && state?.account) ||
        getQueryParams.get('account') ||
        sessionStorage.getItem('query_param_currency') ||
        '';
    const firstAccountKey = tokens.acct1;
    const firstAccountCurrency = clientAccounts[firstAccountKey]?.currency;

    const validCurrencies = [...fiat_currencies_display_order, ...crypto_currencies_display_order];
    if (tokens.acct1?.startsWith('VR') || currency === 'demo') return 'demo';
    if (currency && validCurrencies.includes(currency.toUpperCase())) return currency;
    return firstAccountCurrency || 'USD';
};

/**
 * Handles the PKCE callback: validates state, calls the backend token-exchange
 * endpoint, stores the returned tokens, then redirects to the app.
 *
 * This component is only rendered when getPkceVerifier() is non-null AND a
 * `code` query parameter is present — i.e. we initiated the flow ourselves.
 * All other callbacks fall through to the existing <Callback> component below.
 */
const PkceCallbackHandler = () => {
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const handlePkceCallback = async () => {
            const params = new URLSearchParams(window.location.search);
            const code = params.get('code');
            const returnedState = params.get('state');

            const storedState = getPkceState();
            const verifier = getPkceVerifier();

            if (!code || !verifier) {
                setError('Missing authorization code or code verifier.');
                return;
            }

            if (returnedState !== storedState) {
                clearPkceVerifier();
                clearPkceState();
                setError('State mismatch — possible CSRF. Please try logging in again.');
                return;
            }

            clearPkceVerifier();
            clearPkceState();

            try {
                const response = await fetch('/api/deriv/token-exchange', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        code,
                        code_verifier: verifier,
                        redirect_uri: `${window.location.origin}/callback`,
                    }),
                });

                if (!response.ok) {
                    throw new Error(`Token exchange failed with status ${response.status}`);
                }

                const data = await response.json();
                const tokens: Record<string, string> = data.tokens ?? {};

                const accountsList: Record<string, string> = {};
                const clientAccounts: Record<string, { loginid: string; token: string; currency: string }> = {};

                for (const [key, value] of Object.entries(tokens)) {
                    if (key.startsWith('acct')) {
                        const tokenKey = key.replace('acct', 'token');
                        if (tokens[tokenKey]) {
                            accountsList[value] = tokens[tokenKey];
                            clientAccounts[value] = { loginid: value, token: tokens[tokenKey], currency: '' };
                        }
                    } else if (key.startsWith('cur')) {
                        const accKey = key.replace('cur', 'acct');
                        if (tokens[accKey] && clientAccounts[tokens[accKey]]) {
                            clientAccounts[tokens[accKey]].currency = value;
                        }
                    }
                }

                localStorage.setItem('accountsList', JSON.stringify(accountsList));
                localStorage.setItem('clientAccounts', JSON.stringify(clientAccounts));

                if (tokens.token1) localStorage.setItem('authToken', tokens.token1);
                if (tokens.acct1) localStorage.setItem('active_loginid', tokens.acct1);
                if (tokens.refresh_token) localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
                if (tokens.expires_in) storeTokenExpiry(Number(tokens.expires_in));

                const selected_currency = getSelectedCurrency(tokens, clientAccounts, null);
                window.location.replace(`${window.location.origin}/bot/?account=${selected_currency}`);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Authentication failed. Please try again.');
            }
        };

        handlePkceCallback();
    }, []);

    if (error) {
        return (
            <div>
                <p>{error}</p>
                <button onClick={() => { window.location.href = '/'; }} type='button'>
                    Return to Bot
                </button>
            </div>
        );
    }

    return <div>Completing login, please wait...</div>;
};

/** Detect whether the current callback was initiated by our PKCE flow. */
const isPkceCallback = (): boolean => {
    const params = new URLSearchParams(window.location.search);
    return !!params.get('code') && !!getPkceVerifier();
};

const CallbackPage = () => {
    if (isPkceCallback()) {
        return <PkceCallbackHandler />;
    }

    return (
        <Callback
            onSignInSuccess={async (tokens: Record<string, string>, rawState: unknown) => {
                const state = rawState as { account?: string } | null;
                const accountsList: Record<string, string> = {};
                const clientAccounts: Record<string, { loginid: string; token: string; currency: string }> = {};

                for (const [key, value] of Object.entries(tokens)) {
                    if (key.startsWith('acct')) {
                        const tokenKey = key.replace('acct', 'token');
                        if (tokens[tokenKey]) {
                            accountsList[value] = tokens[tokenKey];
                            clientAccounts[value] = {
                                loginid: value,
                                token: tokens[tokenKey],
                                currency: '',
                            };
                        }
                    } else if (key.startsWith('cur')) {
                        const accKey = key.replace('cur', 'acct');
                        if (tokens[accKey]) {
                            clientAccounts[tokens[accKey]].currency = value;
                        }
                    }
                }

                localStorage.setItem('accountsList', JSON.stringify(accountsList));
                localStorage.setItem('clientAccounts', JSON.stringify(clientAccounts));

                let is_token_set = false;

                const api = await generateDerivApiInstance();
                if (api) {
                    const { authorize, error } = await api.authorize(tokens.token1);
                    api.disconnect();
                    if (error) {
                        if (error.code === 'InvalidToken') {
                            is_token_set = true;

                            const { is_tmb_enabled = false } = useTMB();
                            if (Cookies.get('logged_state') === 'true' && !is_tmb_enabled) {
                                globalObserver.emit('InvalidToken', { error });
                            }
                            if (Cookies.get('logged_state') === 'false') {
                                clearAuthData();
                            }
                        }
                    } else {
                        localStorage.setItem('callback_token', authorize.toString());
                        const clientAccountsArray = Object.values(clientAccounts);
                        const firstId = authorize?.account_list[0]?.loginid;
                        const filteredTokens = clientAccountsArray.filter(account => account.loginid === firstId);
                        if (filteredTokens.length) {
                            localStorage.setItem('authToken', filteredTokens[0].token);
                            localStorage.setItem('active_loginid', filteredTokens[0].loginid);
                            is_token_set = true;
                        }
                    }
                }
                if (!is_token_set) {
                    localStorage.setItem('authToken', tokens.token1);
                    localStorage.setItem('active_loginid', tokens.acct1);
                }

                const selected_currency = getSelectedCurrency(tokens, clientAccounts, state);
                window.location.replace(window.location.origin + `bot/?account=${selected_currency}`);
            }}
            renderReturnButton={() => {
                return (
                    <Button
                        className='callback-return-button'
                        onClick={() => {
                            window.location.href = '/';
                        }}
                    >
                        {'Return to Bot'}
                    </Button>
                );
            }}
        />
    );
};

export default CallbackPage;
