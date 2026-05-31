import React from 'react';
import Cookies from 'js-cookie';
import ChunkLoader from '@/components/loader/chunk-loader';
import { generateDerivApiInstance } from '@/external/bot-skeleton/services/api/appId';
import { observer as globalObserver } from '@/external/bot-skeleton/utils/observer';
import { useOfflineDetection } from '@/hooks/useOfflineDetection';
import { clearAuthData } from '@/utils/auth-utils';
import { localize } from '@deriv-com/translations';
import { URLUtils } from '@deriv-com/utils';
import App from './App';

// Extend Window interface to include is_tmb_enabled property
declare global {
    interface Window {
        is_tmb_enabled?: boolean;
    }
}

/**
 * Bridge tokens from deriv-app login (deriv_access_token) into ddbot format (authToken).
 * This allows a user who logged in via the /login page to be recognized here.
 */
const bridgeDerivAppToken = () => {
    const derivAppToken = localStorage.getItem('deriv_access_token');
    const existingAuthToken = localStorage.getItem('authToken');
    if (derivAppToken && !existingAuthToken) {
        localStorage.setItem('authToken', derivAppToken);
    }
};

const setLocalStorageToken = async (
    loginInfo: URLUtils.LoginInfo[],
    paramsToDelete: string[],
    setIsAuthComplete: React.Dispatch<React.SetStateAction<boolean>>,
    isOnline: boolean
) => {
    if (loginInfo.length) {
        try {
            const defaultActiveAccount = URLUtils.getDefaultActiveAccount(loginInfo);
            if (!defaultActiveAccount) return;

            const accountsList: Record<string, string> = {};
            const clientAccounts: Record<string, { loginid: string; token: string; currency: string }> = {};

            loginInfo.forEach((account: { loginid: string; token: string; currency: string }) => {
                accountsList[account.loginid] = account.token;
                clientAccounts[account.loginid] = account;
            });

            localStorage.setItem('accountsList', JSON.stringify(accountsList));
            localStorage.setItem('clientAccounts', JSON.stringify(clientAccounts));

            URLUtils.filterSearchParams(paramsToDelete);

            // Skip API connection when offline
            if (!isOnline) {
                console.log('[Auth] Offline mode - skipping API connection');
                localStorage.setItem('authToken', loginInfo[0].token);
                localStorage.setItem('active_loginid', loginInfo[0].loginid);
                return;
            }

            try {
                const api = await generateDerivApiInstance();

                if (api) {
                    const { authorize, error } = await api.authorize(loginInfo[0].token);
                    api.disconnect();
                    if (error) {
                        if (error.code === 'InvalidToken') {
                            setIsAuthComplete(true);

                            const is_tmb_enabled = window.is_tmb_enabled === true;
                            if (Cookies.get('logged_state') === 'true' && !is_tmb_enabled) {
                                globalObserver.emit('InvalidToken', { error });
                            }

                            if (Cookies.get('logged_state') === 'false') {
                                clearAuthData();
                            }
                        }
                    } else {
                        localStorage.setItem('client.country', authorize.country);
                        const firstId = authorize?.account_list[0]?.loginid;
                        const filteredTokens = loginInfo.filter(token => token.loginid === firstId);
                        if (filteredTokens.length) {
                            localStorage.setItem('authToken', filteredTokens[0].token);
                            localStorage.setItem('active_loginid', filteredTokens[0].loginid);
                            return;
                        }
                    }
                }
            } catch (apiError) {
                console.error('[Auth] API connection error:', apiError);
                localStorage.setItem('authToken', loginInfo[0].token);
                localStorage.setItem('active_loginid', loginInfo[0].loginid);
            }

            localStorage.setItem('authToken', loginInfo[0].token);
            localStorage.setItem('active_loginid', loginInfo[0].loginid);
        } catch (error) {
            console.error('Error setting up login info:', error);
        }
    }
};

export const AuthWrapper = () => {
    const [isAuthComplete, setIsAuthComplete] = React.useState(false);
    const { loginInfo, paramsToDelete } = URLUtils.getLoginInfoFromURL();
    const { isOnline } = useOfflineDetection();

    React.useEffect(() => {
        // Bridge tokens from deriv-app login before initialising
        bridgeDerivAppToken();

        const initializeAuth = async () => {
            try {
                await setLocalStorageToken(loginInfo, paramsToDelete, setIsAuthComplete, isOnline);
                URLUtils.filterSearchParams(['lang']);
                setIsAuthComplete(true);
            } catch (error) {
                console.error('[Auth] Authentication initialization failed:', error);
                // Don't block the app — allow guest preview even when auth fails
                setIsAuthComplete(true);
            }
        };

        // Allow guest preview immediately when offline
        if (!isOnline) {
            console.log('[Auth] Offline detected, proceeding with minimal auth');
            setIsAuthComplete(true);
        }

        initializeAuth();
    }, [loginInfo, paramsToDelete, isOnline]);

    // Short timeout so the app is never blocked — enables guest preview mode
    React.useEffect(() => {
        const timeout = setTimeout(() => {
            if (!isAuthComplete) {
                console.log('[Auth] Timeout reached, proceeding in guest/preview mode');
                setIsAuthComplete(true);
            }
        }, 3000);
        return () => clearTimeout(timeout);
    }, [isAuthComplete]);

    const getLoadingMessage = () => {
        if (!isOnline) return localize('Loading offline mode...');
        return localize('Initializing...');
    };

    if (!isAuthComplete) {
        return <ChunkLoader message={getLoadingMessage()} />;
    }

    return <App />;
};
