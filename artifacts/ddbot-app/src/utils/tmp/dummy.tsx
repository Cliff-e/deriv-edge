import React from 'react';

type TIcon = {
    icon: string;
    color?: string;
    size?: number;
    className?: string;
    onClick?: () => void;
};

export const Icon = ({ icon, size = 16, className }: TIcon) => (
    <span
        className={className}
        style={{ display: 'inline-block', width: size, height: size }}
        data-icon={icon}
    />
);

export default Icon;
