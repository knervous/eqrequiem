export declare const useResize: (initialWidth: number, initialHeight: number, fixed: boolean) => {
    width: number;
    height: number;
    y: number;
    handleMouseDown: (e: React.MouseEvent, type: "right" | "bottom" | "bottomRight" | "topRight") => void;
    isResizing: boolean;
};
