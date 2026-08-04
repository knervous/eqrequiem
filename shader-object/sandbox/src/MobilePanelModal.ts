/**
 * Turn a docked overlay panel into a dismissible modal on small screens.
 *
 * The sandbox's panels are sized for a desktop corner. On a phone they grew to
 * fill the viewport and had no dismiss affordance, so the 3D view they exist to
 * annotate was completely hidden. Above the breakpoint nothing changes; below
 * it the panel becomes a bottom sheet behind a launcher button, with a
 * backdrop, a close control, and Escape/backdrop dismissal.
 *
 * The panels are built differently — the supermesh UI is hand-rolled DOM, the
 * world editor is React — so this attaches to an existing element rather than
 * owning the markup.
 */

const BREAKPOINT = '(max-width: 700px)';
const STYLE_ID = 'shado-mobile-panel-modal';

const CSS = `
.mpm-launcher,
.mpm-backdrop,
.mpm-close { display: none; }

@media ${BREAKPOINT} {
  [data-mpm="panel"] {
    position: fixed !important;
    inset: auto 8px 8px 8px !important;
    width: auto !important;
    max-width: none !important;
    max-height: min(76dvh, 620px) !important;
    z-index: 39 !important;
    overflow: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    transform: translateY(calc(100% + 24px));
    opacity: 0;
    pointer-events: none;
    transition: transform .2s ease, opacity .16s ease;
  }
  [data-mpm="panel"][data-mpm-open="true"] {
    transform: none;
    opacity: 1;
    pointer-events: auto;
  }

  .mpm-launcher {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    position: fixed;
    right: 12px;
    bottom: 12px;
    z-index: 41;
    min-height: 44px;
    padding: 0 16px;
    border: 1px solid rgba(255, 255, 255, .22);
    border-radius: 999px;
    background: rgba(9, 17, 14, .94);
    color: #e6eee8;
    font: 650 13px system-ui, sans-serif;
    box-shadow: 0 10px 28px rgba(0, 0, 0, .45);
    cursor: pointer;
  }
  .mpm-launcher[data-mpm-open="true"] { display: none; }

  .mpm-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 38;
    border: 0;
    padding: 0;
    background: rgba(3, 7, 12, .62);
    opacity: 0;
    pointer-events: none;
    transition: opacity .18s ease;
  }
  .mpm-backdrop[data-mpm-open="true"] {
    opacity: 1;
    pointer-events: auto;
  }

  .mpm-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    position: sticky;
    top: 0;
    float: right;
    width: 40px;
    height: 40px;
    margin: -4px -4px 0 8px;
    border: 1px solid rgba(255, 255, 255, .2);
    border-radius: 10px;
    background: rgba(9, 17, 14, .92);
    color: inherit;
    font: 600 17px/1 system-ui, sans-serif;
    cursor: pointer;
  }

  /* Phones zoom on focus below 16px. */
  [data-mpm="panel"] input,
  [data-mpm="panel"] select,
  [data-mpm="panel"] textarea { font-size: 16px !important; }
  [data-mpm="panel"] button,
  [data-mpm="panel"] select { min-height: 38px; }
}

@media (prefers-reduced-motion: reduce) {
  [data-mpm="panel"], .mpm-backdrop { transition: none !important; }
}`;

function installStyleOnce() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
}

export type MobilePanelModalHandle = {
  open(): void;
  close(): void;
  dispose(): void;
};

export function installMobilePanelModal(
  panel: HTMLElement,
  { label = 'Panel', openLabel = `☰ ${label}` }: { label?: string; openLabel?: string } = {}
): MobilePanelModalHandle {
  installStyleOnce();
  panel.dataset.mpm = 'panel';

  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.className = 'mpm-launcher';
  launcher.textContent = openLabel;
  launcher.setAttribute('aria-expanded', 'false');

  const backdrop = document.createElement('button');
  backdrop.type = 'button';
  backdrop.className = 'mpm-backdrop';
  backdrop.tabIndex = -1;
  backdrop.setAttribute('aria-label', `Close ${label}`);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'mpm-close';
  close.textContent = '✕';
  close.setAttribute('aria-label', `Close ${label}`);
  panel.prepend(close);

  document.body.append(backdrop, launcher);

  const mobile = window.matchMedia(BREAKPOINT);
  let open = false;

  let lastModal: boolean | undefined;
  const sync = () => {
    const modal = mobile.matches;
    lastModal = modal;
    const shown = !modal || open;
    for (const element of [panel, launcher, backdrop]) {
      element.dataset.mpmOpen = String(open);
    }
    // Only a closed mobile sheet is hidden; the docked desktop panel is not.
    panel.setAttribute('aria-hidden', String(!shown));
    if (shown) panel.removeAttribute('inert');
    else panel.setAttribute('inert', '');
    panel.setAttribute('role', modal ? 'dialog' : 'region');
    if (modal) panel.setAttribute('aria-modal', String(open));
    else panel.removeAttribute('aria-modal');
    launcher.setAttribute('aria-expanded', String(open));
  };

  const setOpen = (value: boolean) => { open = value; sync(); };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && open && mobile.matches) {
      event.stopPropagation();
      setOpen(false);
    }
  };

  // matchMedia's change event is the right signal but does not fire in every
  // host (embedded panes, some devtools viewport emulation), which left the
  // panel `inert` and `aria-hidden` after crossing back to desktop. Resize is
  // the cheap backstop; sync only touches attributes when the mode changed.
  const onResize = () => { if (mobile.matches !== lastModal) sync(); };

  launcher.addEventListener('click', () => setOpen(true));
  backdrop.addEventListener('click', () => setOpen(false));
  close.addEventListener('click', () => setOpen(false));
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', onResize);
  mobile.addEventListener('change', sync);
  sync();

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      mobile.removeEventListener('change', sync);
      launcher.remove();
      backdrop.remove();
      close.remove();
      panel.removeAttribute('data-mpm');
      panel.removeAttribute('data-mpm-open');
      panel.removeAttribute('aria-hidden');
      panel.removeAttribute('aria-modal');
      panel.removeAttribute('role');
      panel.removeAttribute('inert');
    },
  };
}
