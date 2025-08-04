import { useEffect, useRef } from 'react';
import { sleep } from '@game/Constants/util';
import GameManager from '@game/Manager/game-manager';
import { Box } from '@mui/material';
import Overlay from '@ui/components/overlay';
import './player.css';
import './ui.css';

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
      window.addEventListener('keyup', GameManager.instance.keyUp);
    })();

    return () => {
      window.removeEventListener('resize', GameManager.instance.resize);
      window.removeEventListener('keydown', GameManager.instance.keyDown);
      window.removeEventListener('keyup', GameManager.instance.keyUp);
    };
  }, [
  ]);


  useEffect(() => {
    const handleEvent = (e) => {
      if (e.handled) {
        return;
      }
      if (
        e.target instanceof HTMLElement &&
        (e.target.closest('.ui-window') ||
          ['input', 'textarea', 'button', 'select', 'li'].includes(
            e.target.tagName.toLowerCase(),
          ))
      ) {
        // Do not forward the event so that interactive UI elements can function normally.
        return;
      }
      const uiViewport = document.getElementById('ui-viewport');
      const mouseEvents = ['mousedown', 'mouseup', 'mousemove', 'wheel'];
      if (mouseEvents.includes(e.type) && !e.target?.contains(uiViewport)) {
        return;
      }
      // Otherwise, forward the event to the canvas
      if (canvasRef.current) {
        if (e.key === 'F12' || (e.metaKey && e.altKey)) { 
          return;
        }
        // Create a new event of the same type and dispatch it on the canvas
        const newEvent = new e.constructor(e.type, e);
        newEvent.handled = true;
        canvasRef.current.dispatchEvent(newEvent);
        // Optionally prevent default behavior so the event isn't processed twice
        if (e.type === 'mousedown') {
          if (![document.body, canvasRef.current].includes(document.activeElement)) {
            document.body.focus();
            return;
          }
        }
        e.preventDefault();
      }
    };

    // List of events to forward
    const events = [
      'mousedown',
      'mouseup',
      'mousemove',
      'wheel',
      'keydown',
      'keyup',
      'contextmenu',
    ];

    events.forEach((eventName) => {
      document.addEventListener(eventName, handleEvent);
    });

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
          width  : '100vw',
          height : '100vh',
          display: splash ? 'none' : 'initial',
        }}
      />

      <Box
        ref={canvasRef}
        component={'canvas'}
        height="100vh"
        id="renderCanvas"
        tabIndex={0}
        width="100vw"
      />
    </>
  );
};

export default BabylonWrapper;
