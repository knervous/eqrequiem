import React from 'react';
export declare const StatRow: React.FC<{
    label: string;
    stat: string;
    value: number;
    isPreferred: boolean;
    baseValue: number;
    isDisabled?: boolean;
    onDecrement: (stat: string) => void;
    onIncrement: (stat: string) => void;
    statPoints?: number;
}>;
