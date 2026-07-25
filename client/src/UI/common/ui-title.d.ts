import React from 'react';
type Props = {
    name: string;
    handleDragMouseDown: (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
    minimized?: boolean;
    toggleMinimize?: () => void;
    doClose?: () => void;
    closable?: boolean;
    draggable?: boolean;
    useMargin?: boolean;
    marginTop?: number;
};
export declare const UiTitleComponent: React.FC<Props>;
export {};
