/**
 * LoginButton triggers the Deriv OAuth2 PKCE login flow.
 * Drop this wherever a "Log in" action is needed.
 */

import React, { useState } from 'react';
import { initDerivPkceLogin } from '@/auth/deriv-pkce-login';

type LoginButtonProps = {
    className?: string;
    label?: string;
};

const LoginButton = ({ className = '', label = 'Log in with Deriv' }: LoginButtonProps) => {
    const [isRedirecting, setIsRedirecting] = useState(false);

    const handleClick = async () => {
        if (isRedirecting) return;
        setIsRedirecting(true);
        try {
            await initDerivPkceLogin();
        } catch {
            setIsRedirecting(false);
        }
    };

    return (
        <button className={className} disabled={isRedirecting} onClick={handleClick} type='button'>
            {isRedirecting ? 'Redirecting...' : label}
        </button>
    );
};

export default LoginButton;
