import React, { useCallback, useEffect, useState } from "react";
import { fsBindings } from "../Core/bindings";

type MainContextValue = {
  ready: boolean;
  splash: boolean;
  setSplash: (visible: boolean) => void;
};

export const MainContext = React.createContext<MainContextValue>({
  ready: false,
  splash: false,
  setSplash() {},
});

export const useMainContext = (): MainContextValue =>
  React.useContext(MainContext);

type MainProviderProps = {
  children: React.ReactNode;
};

export const MainProvider = ({ children }: MainProviderProps) => {
  const [ready, setReady] = useState(false);
  const [splashCounter, setSplashCounter] = useState(0);

  const setSplash = useCallback((visible: boolean) => {
    setSplashCounter((current) =>
      visible ? current + 1 : Math.max(0, current - 1),
    );
  }, []);

  useEffect(() => {
    fsBindings.initialize({ setSplash });
    setReady(true);
  }, [setSplash]);

  return (
    <MainContext.Provider
      value={{
        ready,
        splash: splashCounter > 0,
        setSplash,
      }}
    >
      {children}
    </MainContext.Provider>
  );
};
