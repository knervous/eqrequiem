import { useRef, useState } from "react";


export // Custom hook for resizing logic
const useResize = (initialWidth: number, initialHeight: number, fixed: boolean) => {
  const [width, setWidth] = useState(initialWidth);
  const [height, setHeight] = useState(initialHeight);
  const [y, setY] = useState(0); // For top-right resize affecting y-position
  const resizingRef = useRef<{ type: "right" | "bottom" | "bottomRight" | "topRight" | null }>({ type: null });
  const resizeStartPos = useRef({ x: 0, y: 0 });
  const windowStartSize = useRef({ width: initialWidth, height: initialHeight });
  const windowStartY = useRef(y);

  const handleMouseDown = (e: React.MouseEvent, type: "right" | "bottom" | "bottomRight" | "topRight") => {
    if (fixed) return;
    e.stopPropagation();
    resizingRef.current = { type };
    resizeStartPos.current = { x: e.clientX, y: e.clientY };
    windowStartSize.current = { width, height };
    windowStartY.current = y;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!resizingRef.current.type || fixed) return;
    const dx = e.clientX - resizeStartPos.current.x;
    const dy = e.clientY - resizeStartPos.current.y;
    const minSize = 25;

    switch (resizingRef.current.type) {
      case "right":
        setWidth(Math.max(minSize, windowStartSize.current.width + dx));
        break;
      case "bottom":
        setHeight(Math.max(minSize, windowStartSize.current.height + dy));
        break;
      case "bottomRight":
        setWidth(Math.max(minSize, windowStartSize.current.width + dx));
        setHeight(Math.max(minSize, windowStartSize.current.height + dy));
        break;
      case "topRight":
        setWidth(Math.max(minSize, windowStartSize.current.width + dx));
        setHeight(Math.max(minSize, windowStartSize.current.height - dy));
        setY(windowStartY.current + dy);
        break;
    }
  };

  const handleMouseUp = () => {
    resizingRef.current = { type: null };
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };

  return { width, height, y, handleMouseDown, isResizing: !!resizingRef.current.type };
};