import React from 'react';
type MainContextValue = {
    ready: boolean;
    splash: boolean;
    setSplash: (visible: boolean) => void;
};
export declare const MainContext: React.Context<MainContextValue>;
export declare const useMainContext: () => MainContextValue;
type MainProviderProps = {
    children: React.ReactNode;
};
export declare const MainProvider: ({ children }: MainProviderProps) => import("react/jsx-runtime").JSX.Element;
export {};
