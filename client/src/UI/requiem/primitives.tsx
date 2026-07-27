import React from 'react';
import './tokens.css';
import './primitives.css';

type PanelProps = {
  children: React.ReactNode;
  className?: string;
  eyebrow?: string;
  title: string;
};

export const RequiemPanel: React.FC<PanelProps> = ({
  children,
  className = '',
  eyebrow,
  title,
}) => (
  <section className={`rq-panel ${className}`.trim()}>
    <header className="rq-panel__header">
      <div>
        {eyebrow ? <p className="rq-panel__eyebrow">{eyebrow}</p> : null}
        <h1 className="rq-panel__title">{title}</h1>
      </div>
      <div aria-hidden="true" className="rq-panel__ornament">
        <span />
        <span />
        <span />
      </div>
    </header>
    <div className="rq-panel__body">{children}</div>
  </section>
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'quiet';
};

export const RequiemButton: React.FC<ButtonProps> = ({
  children,
  className = '',
  type = 'button',
  variant = 'default',
  ...props
}) => (
  <button
    className={`rq-button rq-button--${variant} ${className}`.trim()}
    type={type}
    {...props}
  >
    {children}
  </button>
);

type StatusProps = {
  children: React.ReactNode;
  tone?: 'ready' | 'development';
};

export const RequiemStatus: React.FC<StatusProps> = ({
  children,
  tone = 'ready',
}) => (
  <span className={`rq-status rq-status--${tone}`}>{children}</span>
);
