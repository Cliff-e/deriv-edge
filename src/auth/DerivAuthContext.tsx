/**
 * DerivAuthContext — unified auth context for the Deriv PKCE login system.
 *
 * Wraps the following pieces into one consistent state tree:
 *   • Token verification  (useTokenVerification)
 *   • Silent auto-refresh (useAutoRefresh)
 *   • Multi-account switch (switchAccount)
 *   • Logout              (derivLogout)
 *
 * Usage
 * -----
 *   // 1. Wrap your app (or the authenticated section) once:
 *   <DerivAuthProvider onUnauthenticated={() => { window.location.href = '/'; }}>
 *       <App />
 *   </DerivAuthProvider>
 *
 *   // 2. Consume anywhere inside the tree:
 *   const { isAuthenticated, activeLoginId, accounts, logout, switchTo } = useDerivAuth();
 *
 * Notes
 * -----
 *   • Coexists with the legacy OIDC system — it never touches tokens that were
 *     not written by the PKCE flow.  If authToken is absent the context stays
 *     in the unauthenticated (idle) state without clearing any legacy session.
 *   • onUnauthenticated is called when startup verification fails OR when a
 *     silent refresh fails. Wire it to your login redirect.
 */

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react';
import { switchAccount, getStoredAccounts, getActiveLoginId, type ClientAccount } from './account-switch';
import { derivLogout } from './logout';
import { clearTokenStorage, msUntilExpiry, refreshDerivTokens } from './refresh-token';
import { verifyStoredToken } from './verify-token';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DerivAuthState = {
    /** True once the stored token has been verified by the backend. */
    isAuthenticated: boolean;
    /** True while the initial startup verification is in flight. */
    isVerifying: boolean;
    /** Loginid of the currently active account, e.g. "CR123456". */
    activeLoginId: string | null;
    /** All accounts stored from the initial login. */
    accounts: ClientAccount[];
    /** True while an account-switch network call is in flight. */
    isSwitching: boolean;
    /** Revokes the session on the backend and clears localStorage. */
    logout: (opts?: { onComplete?: () => void }) => Promise<void>;
    /** Validates + switches to a different loginid. */
    switchTo: (loginid: string) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

const SKIP_PATHS = ['/callback', '/endpoint'];
const REFRESH_BEFORE_EXPIRY_MS = 60_000;
const MIN_SCHEDULE_MS = 5_000;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const DerivAuthContext = createContext<DerivAuthState | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

type ProviderProps = {
    children: React.ReactNode;
    /**
     * Called when the token is absent, fails verification, or a silent refresh
     * fails. Typically redirects to the login page.
     */
    onUnauthenticated?: (reason: string) => void;
};

export const DerivAuthProvider = ({ children, onUnauthenticated }: ProviderProps) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isVerifying, setIsVerifying] = useState(true);
    const [activeLoginId, setActiveLoginId] = useState<string | null>(getActiveLoginId);
    const [isSwitching, setIsSwitching] = useState(false);

    const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onUnauthenticatedRef = useRef(onUnauthenticated);
    onUnauthenticatedRef.current = onUnauthenticated;

    // -----------------------------------------------------------------------
    // Auto-refresh scheduler (only active while authenticated)
    // -----------------------------------------------------------------------

    const scheduleRefresh = useCallback(() => {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

        const ms = msUntilExpiry();
        if (ms < 0) return;

        const delay = Math.max(ms - REFRESH_BEFORE_EXPIRY_MS, MIN_SCHEDULE_MS);

        refreshTimerRef.current = setTimeout(async () => {
            const success = await refreshDerivTokens();
            if (success) {
                setActiveLoginId(getActiveLoginId());
                scheduleRefresh();
            } else {
                setIsAuthenticated(false);
                setActiveLoginId(null);
                onUnauthenticatedRef.current?.('Session expired — silent refresh failed');
            }
        }, delay);
    }, []);

    // -----------------------------------------------------------------------
    // Startup verification (runs once on mount)
    // -----------------------------------------------------------------------

    useEffect(() => {
        const shouldSkip = SKIP_PATHS.some(p => window.location.pathname.startsWith(p));

        if (shouldSkip) {
            setIsVerifying(false);
            return;
        }

        const token = localStorage.getItem('authToken');
        if (!token) {
            setIsVerifying(false);
            return;
        }

        verifyStoredToken().then(result => {
            if (result.valid) {
                setIsAuthenticated(true);
                setActiveLoginId(getActiveLoginId());
                scheduleRefresh();
            } else {
                clearTokenStorage();
                onUnauthenticatedRef.current?.(result.reason);
            }
            setIsVerifying(false);
        });

        return () => {
            if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // -----------------------------------------------------------------------
    // Actions
    // -----------------------------------------------------------------------

    const logout = useCallback(
        async ({ onComplete }: { onComplete?: () => void } = {}) => {
            if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
            await derivLogout({ onComplete });
            setIsAuthenticated(false);
            setActiveLoginId(null);
        },
        [],
    );

    const switchTo = useCallback(
        async (loginid: string) => {
            if (isSwitching) return;
            setIsSwitching(true);

            const result = await switchAccount(loginid);
            setIsSwitching(false);

            if (result.success) {
                setActiveLoginId(result.loginid);
            } else {
                // Token for that account expired — kick the user to login
                clearTokenStorage();
                setIsAuthenticated(false);
                setActiveLoginId(null);
                onUnauthenticatedRef.current?.(result.reason);
            }
        },
        [isSwitching],
    );

    // -----------------------------------------------------------------------
    // Value
    // -----------------------------------------------------------------------

    const accounts = Object.values(getStoredAccounts());

    const value: DerivAuthState = {
        isAuthenticated,
        isVerifying,
        activeLoginId,
        accounts,
        isSwitching,
        logout,
        switchTo,
    };

    return (
        <DerivAuthContext.Provider value={value}>
            {children}
        </DerivAuthContext.Provider>
    );
};

// ---------------------------------------------------------------------------
// Consumer hook (see useDerivAuth.ts for the public export)
// ---------------------------------------------------------------------------

export const useDerivAuthContext = (): DerivAuthState => {
    const ctx = useContext(DerivAuthContext);
    if (!ctx) {
        throw new Error('useDerivAuth must be used inside <DerivAuthProvider>');
    }
    return ctx;
};
