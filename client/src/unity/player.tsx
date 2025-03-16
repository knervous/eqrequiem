import React, { useEffect, useRef } from "react";
import classnames from "classnames";
import { Box } from "@mui/material";

import './unityBridge'

export const UnityPlayer: React.FC = () => {
  // Create refs for elements that need to be manipulated.
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loadingBarRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const warningRef = useRef<HTMLDivElement>(null);
  const diagnosticsIconRef = useRef<HTMLImageElement>(null);
  const fullscreenButtonRef = useRef<HTMLDivElement>(null);
  const buildTitleRef = useRef<HTMLDivElement>(null);
  const unityInstanceRef = useRef<any>(null);
  const scriptRef = useRef<HTMLScriptElement>(null);

  // Determine if the user is on a mobile device.
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // For mobile devices, add a meta tag to adjust the viewport.
  useEffect(() => {
    if (isMobile) {
      const meta = document.createElement("meta");
      meta.name = "viewport";
      meta.content =
        "width=device-width, height=device-height, initial-scale=1.0, user-scalable=no, shrink-to-fit=yes";
      document.head.appendChild(meta);
    }
  }, [isMobile]);

  // A function to display banners for warnings or errors.
  const unityShowBanner = (msg: string, type: string) => {
    if (!warningRef.current) return;
    const bannerContainer = warningRef.current;
    const bannerBox = document.createElement("div");
    bannerBox.innerHTML = msg;
    bannerBox.style.padding = "10px";

    if (type === "error") {
      bannerBox.style.background = "red";
    } else if (type === "warning") {
      bannerBox.style.background = "yellow";
      setTimeout(() => {
        bannerContainer.removeChild(bannerBox);
        bannerContainer.style.display =
          bannerContainer.children.length > 0 ? "block" : "none";
      }, 5000);
    }
    bannerContainer.appendChild(bannerBox);
    bannerContainer.style.display = "block";
  };

  // Load Unity and set up the instance.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Adjust canvas styles for desktop or mobile.
    if (!isMobile) {
      canvas.style.width = "calc(100vw - 0px)";
      canvas.style.height = "calc(100vh - 42px)";
    } else {
      canvas.className = "unity-mobile";
      if (diagnosticsIconRef.current) {
        diagnosticsIconRef.current.style.position = "fixed";
        diagnosticsIconRef.current.style.bottom = "10px";
        diagnosticsIconRef.current.style.right = "0px";
      }
    }

    // Show the loading bar.
    if (loadingBarRef.current) {
      loadingBarRef.current.style.display = "block";
    }

    // Build the URLs required by the Unity loader.
    const buildUrl = "TestOutput/Build";
    const loaderUrl = `${buildUrl}/TestOutput.loader.js`;

    const config = {
      arguments: [],
      dataUrl: `${buildUrl}/TestOutput.data`,
      frameworkUrl: `${buildUrl}/TestOutput.framework.js`,
      workerUrl: `${buildUrl}/TestOutput.worker.js`,
      codeUrl: `${buildUrl}/TestOutput.wasm`,
      streamingAssetsUrl: "StreamingAssets",
      companyName: "DefaultCompany",
      productName: "Test5",
      productVersion: "0.1.0",
      showBanner: unityShowBanner,
    };

    // Dynamically load the Unity loader script.
    const script = document.createElement("script");
    script.src = loaderUrl;
    scriptRef.current = script;
    script.onload = () => {
      // @ts-ignore: createUnityInstance is provided by the Unity loader.
      createUnityInstance(canvas, config, (progress: number) => {
        if (progressBarRef.current) {
          progressBarRef.current.style.width = `${100 * progress}%`;
        }
      })
        .then((unityInstance: any) => {
          unityInstanceRef.current = unityInstance;
          if (loadingBarRef.current) {
            loadingBarRef.current.style.display = "none";
          }
          if (diagnosticsIconRef.current) {
            diagnosticsIconRef.current.onclick = () => {
              // @ts-ignore: unityDiagnostics is provided by the Unity loader.
              unityDiagnostics.openDiagnosticsBox(unityInstance.GetMetricsInfo);
            };
          }
          if (fullscreenButtonRef.current) {
            fullscreenButtonRef.current.onclick = () => {
              unityInstance.SetFullscreen(1);
            };
          }
          // Instead of dynamically creating the Unload button via vanilla JS,
          // we insert it into the build title area.
          if (buildTitleRef.current) {
            const quitButton = document.createElement("button");
            quitButton.style.marginLeft = "5px";
            quitButton.style.backgroundColor = "lightgray";
            quitButton.style.border = "none";
            quitButton.style.padding = "5px";
            quitButton.style.cursor = "pointer";
            quitButton.innerHTML = "Unload";
            quitButton.onclick = () => {
              unityInstance.Quit().then(() => {
                // Remove the Unity container and script from the DOM.
                container.parentNode?.removeChild(container);
                scriptRef.current?.parentNode?.removeChild(scriptRef.current);
              });
            };
            buildTitleRef.current.appendChild(quitButton);
          }
        })
        .catch((message: any) => {
          alert(message);
        });
    };

    document.body.appendChild(script);

    // Clean up the script on unmount.
    return () => {
      if (scriptRef.current && scriptRef.current.parentNode) {
        scriptRef.current.parentNode.removeChild(scriptRef.current);
      }
    };
  }, [isMobile]);

  return (
    <Box
      id="unity-container"
      ref={containerRef}
      className={classnames({ "unity-mobile": isMobile, "unity-desktop": !isMobile })}
    >
      <canvas
        ref={canvasRef}
        id="unity-canvas"
        tabIndex={-1}
        className={classnames({ "unity-mobile": isMobile })}
      ></canvas>
      <Box id="unity-loading-bar" ref={loadingBarRef}>
        <Box id="unity-logo"></Box>
        <Box id="unity-progress-bar-empty">
          <Box id="unity-progress-bar-full" ref={progressBarRef}></Box>
        </Box>
      </Box>
      <Box id="unity-warning" ref={warningRef}></Box>
      <Box id="unity-footer">
        <Box id="unity-logo-title-footer"></Box>
        <Box id="unity-fullscreen-button" ref={fullscreenButtonRef}></Box>
        <img
          id="diagnostics-icon"
          ref={diagnosticsIconRef}
          src="TemplateData/webmemd-icon.png"
          alt="Diagnostics Icon"
        />
        <Box id="unity-build-title" ref={buildTitleRef}>
         EQ: Requiem Dev
        </Box>
      </Box>
    </Box>
  );
};

export default UnityPlayer;
