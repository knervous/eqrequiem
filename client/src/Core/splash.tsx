import React from 'react';
import './splash.css';

type SplashFile = {
  name: string;
};

type SplashProps = {
  files?: SplashFile[];
};

export const SplashScreen: React.FC<SplashProps> = ({ files = [] }) => (
  <section aria-busy="true" aria-live="polite" className="eltania-splash">
    <div aria-hidden="true" className="eltania-splash__veil" />
    <div className="eltania-splash__content">
      <img
        alt=""
        className="eltania-splash__mark"
        src="/eltania/mark.svg"
      />
      <h1>Shadows of Eltania</h1>
      <p className="eltania-splash__eyebrow">Elrador</p>
      <div aria-hidden="true" className="eltania-splash__progress">
        <span />
      </div>
      <span className="eltania-splash__status">
        Loading world data{files.length ? `: ${files.at(-1)?.name}` : ''}
      </span>
    </div>
  </section>
);
