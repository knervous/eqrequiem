import React from 'react';
import { UiWindow, UiState } from '../state/initial-state';
import './ui-window.css';
type Props = {
    state: UiWindow;
    index?: number;
    title?: string;
    windowName: keyof UiState;
    children?: React.ReactNode;
    draggable?: boolean;
    closable?: boolean;
    doClose?: () => void;
    background?: string;
};
export declare const UiWindowComponent: React.FC<Props>;
export {};
