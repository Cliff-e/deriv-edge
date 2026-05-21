/**
 * LoginPage renders a Deriv PKCE login entry point.
 *
 * It coexists with the legacy login system — the PKCE button is a net-new
 * addition and does not modify or replace any existing login logic.
 */

import React from 'react';
import LoginButton from '@/components/LoginButton';

const LoginPage = () => {
    return (
        <div className='login-page'>
            <LoginButton />
        </div>
    );
};

export default LoginPage;
