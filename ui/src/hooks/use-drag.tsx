import { useRef, useState } from "react";

export 
// Custom hook for dragging logic
const useDrag = (initialX: number, initialY: number) => {
  const [x, setX] = useState(initialX);
  const [y, setY] = useState(initialY);
  const draggingRef = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const windowStartPos = useRef({ x: initialX, y: initialY });

  const handleMouseDown = (e: React.MouseEvent) => {
    draggingRef.current = true;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    windowStartPos.current = { x, y };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - dragStartPos.current.x;
    const dy = e.clientY - dragStartPos.current.y;
    setX(windowStartPos.current.x + dx);
    setY(windowStartPos.current.y + dy);
  };

  const handleMouseUp = () => {
    draggingRef.current = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };

  return { x, y, handleMouseDown };
};
