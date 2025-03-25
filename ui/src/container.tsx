import { Box } from "@mui/material";
import React from "react";
import Overlay from "./components/overlay";

declare const window: Window & {
  godotBridge?: {
    postMessage: (message: string) => void;
  };
  ipc?: {
    postMessage: (message: string) => void;
  };
};
type MouseOrWheelEvent = MouseEvent & WheelEvent;

export const EditorContainer: React.FC = () => {
  const handleMouseEvent = (eventType: string, e: MouseOrWheelEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest(".ui-window") && !['mouseup'].includes(eventType)) {
      return;
    }
    const payload = {
      type: eventType,
      x: e.clientX,
      y: e.clientY,
      relativeX: e.movementX,
      relativeY: e.movementY,
      deltaX: e.deltaX,
      deltaY: e.deltaY,
      button: e.button,
    };
    if (window.ipc) {
      e.preventDefault();
      window.ipc.postMessage(JSON.stringify(payload));
    }
  };
  const getEQFile = async (path: string): Promise<ArrayBuffer | null> => {
    const result = await fetch(`/file?path=${path}`).then(a => a.arrayBuffer()).catch(() => null);
    return result;
  }
  return (
    <Box
      onMouseDown={(e) =>
        handleMouseEvent("mousedown", e as unknown as MouseOrWheelEvent)
      }
      onMouseUp={(e) =>
        handleMouseEvent("mouseup", e as unknown as MouseOrWheelEvent)
      }
      onMouseMove={(e) =>
        handleMouseEvent("mousemove", e as unknown as MouseOrWheelEvent)
      }
      onContextMenu={(e) => e.preventDefault()}
      onWheel={(e) =>
        handleMouseEvent("wheel", e as unknown as MouseOrWheelEvent)
      }
      sx={{
        zIndex: 9999,
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(0,0,0,0.0)",
      }}
    >
      <Overlay getEQFile={getEQFile} />
    </Box>
  );
};
