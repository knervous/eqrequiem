import React, { useEffect, useRef } from "react";
import { Overlay } from "requiem-ui/components/overlay";
import { getRootEQFile } from 'sage-core/util/fileHandler';
import "./ui.css";

export const GodotWrapper = ({ splash }) => {
  const canvasRef = useRef(null);
  const statusOverlayRef = useRef(null);
  const statusProgressRef = useRef(null);
  const statusNoticeRef = useRef(null);

  useEffect(() => {
    // Dynamically load the Godot engine script (Test.js)
    const script = document.createElement("script");
    script.src = "Test.js";
    script.async = true;
    script.onload = () => {
      if (typeof Engine === "undefined") {
        console.error("Engine is not defined after loading Test.js");
        return;
      }

      // Get references from our React refs
      if (
        !statusOverlayRef.current ||
        !statusProgressRef.current ||
        !statusNoticeRef.current
      ) {
        console.error("Status overlay elements not found");
        return;
      }
      const statusOverlay = statusOverlayRef.current;
      const statusProgress = statusProgressRef.current;
      const statusNotice = statusNoticeRef.current;

      let initializing = true;
      let statusMode = "";

      function setStatusMode(mode) {
        if (statusMode === mode || !initializing) return;
        if (mode === "hidden") {
          statusOverlay.remove();
          initializing = false;
          return;
        }
        statusOverlay.style.visibility = "visible";
        statusProgress.style.display = mode === "progress" ? "block" : "none";
        statusNotice.style.display = mode === "notice" ? "block" : "none";
        statusMode = mode;
      }

      function setStatusNotice(text) {
        while (statusNotice.lastChild) {
          statusNotice.removeChild(statusNotice.lastChild);
        }
        const lines = text.split("\n");
        lines.forEach((line) => {
          statusNotice.appendChild(document.createTextNode(line));
          statusNotice.appendChild(document.createElement("br"));
        });
      }

      function displayFailureNotice(err) {
        console.error(err);
        if (err instanceof Error) {
          setStatusNotice(err.message);
        } else if (typeof err === "string") {
          setStatusNotice(err);
        } else {
          setStatusNotice("An unknown error occurred.");
        }
        setStatusMode("notice");
        initializing = false;
      }

      const GODOT_CONFIG = {
        args: [],
        canvasResizePolicy: 2,
        ensureCrossOriginIsolationHeaders: true,
        executable: "Test",
        experimentalVK: false,
        fileSizes: { "Test.pck": 881488, "Test.wasm": 44446287 },
        focusCanvas: true,
        gdextensionLibs: [],
      };
      const GODOT_THREADS_ENABLED = true;
      const engine = new Engine(GODOT_CONFIG);

      const missing = Engine.getMissingFeatures({
        threads: GODOT_THREADS_ENABLED,
      });

      if (missing.length !== 0) {
        if (
          GODOT_CONFIG["serviceWorker"] &&
          GODOT_CONFIG["ensureCrossOriginIsolationHeaders"] &&
          "serviceWorker" in navigator
        ) {
          let serviceWorkerRegistrationPromise;
          try {
            serviceWorkerRegistrationPromise =
              navigator.serviceWorker.getRegistration();
          } catch (err) {
            serviceWorkerRegistrationPromise = Promise.reject(
              new Error("Service worker registration failed.")
            );
          }
          // There's a chance that installing the service worker would fix the issue
          Promise.race([
            serviceWorkerRegistrationPromise
              .then((registration) => {
                if (registration != null) {
                  return Promise.reject(
                    new Error("Service worker already exists.")
                  );
                }
                return registration;
              })
              .then(() => engine.installServiceWorker()),
            // For some reason, getRegistration() can stall
            new Promise((resolve) => {
              setTimeout(() => resolve(), 2000);
            }),
          ])
            .then(() => {
              // Reload if there was no error.
              window.location.reload();
            })
            .catch((err) => {
              console.error("Error while registering service worker:", err);
            });
        } else {
          // Display the message as usual
          const missingMsg =
            "Error\nThe following features required to run Godot projects on the Web are missing:\n";
          displayFailureNotice(missingMsg + missing.join("\n"));
        }
      } else {
        setStatusMode("progress");
        engine
          .startGame({
            onProgress: function (current, total) {
              if (current > 0 && total > 0) {
                statusProgress.value = current;
                statusProgress.max = total;
              } else {
                statusProgress.removeAttribute("value");
                statusProgress.removeAttribute("max");
              }
            },
          })
          .then(() => {
            setStatusMode("hidden");
          }, displayFailureNotice);
      }
    };

    document.body.appendChild(script);

    // Cleanup script on component unmount
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  useEffect(() => {
    const handleEvent = (e) => {
      // If the event target is within a UI component (e.g. a div with a specific class),
      // then do nothing (or call e.stopPropagation() if needed)
      if (
        e.target instanceof HTMLElement &&
        (e.target.closest(".ui-window") ||
          ["input", "textarea", "button", "select"].includes(
            e.target.tagName.toLowerCase()
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
        // Create a new event of the same type and dispatch it on the canvas
        const newEvent = new e.constructor(e.type, e);
        newEvent.handled = true;
        canvasRef.current.dispatchEvent(newEvent);
        // Optionally prevent default behavior so the event isn't processed twice
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
      <style>{`
        html, body, #canvas {
          margin: 0;
          padding: 0;
          border: 0;
        }
        body {
          color: white;
          background-color: black;
          overflow: hidden;
          touch-action: none;
        }
        #canvas {
          display: block;
        }
        #canvas:focus {
          outline: none;
        }
        #status, #status-splash, #status-progress {
          position: absolute;
          left: 0;
          right: 0;
        }
        #status, #status-splash {
          top: 0;
          bottom: 0;
        }
        #status {
          background-color: #242424;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          visibility: hidden;
        }
        #status-splash {
          max-height: 100%;
          max-width: 100%;
          margin: auto;
        }
        #status-splash.show-image--false {
          display: none;
        }
        #status-splash.fullsize--true {
          height: 100%;
          width: 100%;
          object-fit: contain;
        }
        #status-splash.use-filter--false {
          image-rendering: pixelated;
        }
        #status-progress, #status-notice {
          display: none;
        }
        #status-progress {
          bottom: 10%;
          width: 50%;
          margin: 0 auto;
        }
        #status-notice {
          background-color: #5b3943;
          border-radius: 0.5rem;
          border: 1px solid #9b3943;
          color: #e0e0e0;
          font-family: 'Noto Sans', 'Droid Sans', Arial, sans-serif;
          line-height: 1.3;
          margin: 0 2rem;
          overflow: hidden;
          padding: 1rem;
          text-align: center;
          z-index: 1;
        }
      `}</style>
      {window.godotBridge && (
        <Overlay
        getEQFile={getRootEQFile}
          sx={{
            width: "100vw",
            height: "100vh",
            display: splash ? "none" : "initial",
          }}
        />
      )}
      <canvas id="canvas" ref={canvasRef} tabIndex={0}>
        Your browser does not support the canvas tag.
      </canvas>
      <div id="status" ref={statusOverlayRef}>
        <img
          id="status-splash"
          className="show-image--true fullsize--true use-filter--true"
          src="Test.png"
          alt=""
        />
        <progress id="status-progress" ref={statusProgressRef}></progress>
        <div id="status-notice" ref={statusNoticeRef}></div>
      </div>
    </>
  );
};

export default GodotWrapper;
