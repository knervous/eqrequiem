import React, { useEffect, useRef } from "react";
import "./ui.css";
import "./player.css";

export const GodotWrapper = ({ splash }) => {
  const canvasRef = useRef(null);
  const statusOverlayRef = useRef(null);
  const statusProgressRef = useRef(null);
  const statusNoticeRef = useRef(null);
  const [loaded, setLoaded] = React.useState(false);
  const [Overlay, setOverlay] = React.useState({ Component: null });
  useEffect(() => {
    window.onLoadGame = (node) => {
      console.log('Called on load game');
      import('../Game/root').then(async ({ initializeGame }) => {
        // window.loadGame();
        initializeGame(node);
        const overlay = await import('../UI/components/overlay');
        setOverlay({ Component: overlay.Overlay });
        setLoaded(true);

      });
    };
  }, []);
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "Test.js";
    script.async = true;
    script.onload = () => {

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
              new Error("Service worker registration failed."),
            );
          }
          // There's a chance that installing the service worker would fix the issue
          Promise.race([
            serviceWorkerRegistrationPromise
              .then((registration) => {
                if (registration != null) {
                  return Promise.reject(
                    new Error("Service worker already exists."),
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

  return (
    <>
      {loaded && <Overlay.Component
        sx={{
          width: "100vw",
          height: "100vh",
          display: splash ? "none" : "initial",
        }}
      />
      }
     
      <canvas id="canvas" ref={canvasRef} tabIndex={0}>
        Your browser does not support the canvas tag.
      </canvas>
      <div id="status" ref={statusOverlayRef}>
        <img
          id="status-splash"
          style={{ width: '50vw', height: '50vh' }}
          className="show-image--true fullsize--true use-filter--true"
          src="/brand/png/logo-no-background-white.png"
          alt=""
        />
        <progress id="status-progress" ref={statusProgressRef}></progress>
        <div id="status-notice" ref={statusNoticeRef}></div>
      </div>
    </>
  );
};

export default GodotWrapper;
