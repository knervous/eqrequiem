import { FullActionData, FullItemEntryData } from './constants';
export declare function useItemDragClone<T extends HTMLElement>(actionData?: FullItemEntryData | null): {
    elementRef: import("react").RefObject<T | null>;
    onMouseDown: (e: React.MouseEvent) => void;
};
export declare function useImmediateDragClone<T extends HTMLElement>(scale?: number, actionData?: FullActionData | null): {
    elementRef: import("react").RefObject<T | null>;
    onMouseDown: (e: React.MouseEvent) => void;
};
