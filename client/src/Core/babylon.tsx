import React, { useEffect, useRef } from "react";
import "./ui.css";
import "./player.css";
import Overlay from "@ui/components/overlay";
import { Box } from "@mui/material";
import { sleep } from "@game/Constants/util";
import GameManager from "@game/Manager/game-manager";

export const BabylonWrapper = ({ splash }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    (async () => {

      while (!canvasRef.current) {
        await sleep(50);
      }
      await GameManager.instance.loadEngine(canvasRef.current);
      window.addEventListener('resize', GameManager.instance.resize);
      window.addEventListener('keydown', GameManager.instance.keyDown);
    })();

    return () => {
      window.removeEventListener('resize', GameManager.instance.resize);
      window.removeEventListener('keydown', GameManager.instance.keyDown);
    };
  }, [
  ]);


  useEffect(() => {
    const handleEvent = (e) => {
      // If the event target is within a UI component (e.g. a div with a specific class),
      // then do nothing (or call e.stopPropagation() if needed)
      if (
        e.target instanceof HTMLElement &&
        (e.target.closest(".ui-window") ||
          ["input", "textarea", "button", "select", "li"].includes(
            e.target.tagName.toLowerCase(),
          ))
      ) {
        // Do not forward the event so that interactive UI elements can function normally.
        return;
      }
      if (e.handled) {
        return;
      }
      // Otherwise, forward the event to the canvas
      if (canvasRef.current) {
        if (e.key === "F12" || (e.metaKey && e.altKey)) { 
          return;
        }
        // Create a new event of the same type and dispatch it on the canvas
        const newEvent = new e.constructor(e.type, e);
        newEvent.handled = true;
        canvasRef.current.dispatchEvent(newEvent);
        // Optionally prevent default behavior so the event isn't processed twice
        if (e.type === "mousedown") {
          console.log('Click here', e.type);

          if (![document.body, canvasRef.current].includes(document.activeElement)) {
            console.log('Click wanna focus', e.type);
            document.body.focus();
            return;
          }
        }
        e.preventDefault();
      }
    };

    // List of events to forward
    const events = [
      "mousedown",
      "mouseup",
      "mousemove",
      "wheel",
      "keydown",
      "keyup",
      "contextmenu",
    ];

    events.forEach((eventName) => {
      document.addEventListener(eventName, handleEvent);
    });

    // Cleanup on unmount
    return () => {
      events.forEach((eventName) => {
        document.removeEventListener(eventName, handleEvent);
      });
    };
  }, []);

  return (
    <>
      <Overlay
        sx={{
          width: "100vw",
          height: "100vh",
          display: splash ? "none" : "initial",
        }}
      />

      <Box
        as="canvas"
        tabIndex={0}
        sx={{ flexGrow: "1", position: "fixed" }}
        ref={canvasRef}
        id="renderCanvas"
        width="100vw"
        height="100vh"
      />
    </>
  );
};

export default BabylonWrapper;
