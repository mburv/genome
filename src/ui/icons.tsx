/** Shared 24×24 line icons for the under-board action row (D-UI-15). */
const ATTR = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'square' as const,
  strokeLinejoin: 'miter' as const,
  'aria-hidden': true as const,
  focusable: false,
  width: 22,
  height: 22,
};

export function IconBolt() {
  return (
    <svg {...ATTR} width={14} height={14}>
      <path d="M13 2L6 13h5l-1 9 8-12h-5l2-8z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconCrispr() {
  return (
    <svg {...ATTR}>
      <circle cx="6.5" cy="6.5" r="2.4" />
      <circle cx="6.5" cy="17.5" r="2.4" />
      <path d="M8.3 7.8L20 17.5M8.3 16.2L20 6.5" />
    </svg>
  );
}

export function IconLigase() {
  return (
    <svg {...ATTR}>
      <path d="M9.5 8H7.2a3.2 3.2 0 000 8h2.3M14.5 8h2.3a3.2 3.2 0 010 8h-2.3M8.5 12h7" />
    </svg>
  );
}

export function IconScaffold() {
  return (
    <svg {...ATTR}>
      <path d="M3 18V8h2.2v5.5h13.6V8H21v10" />
      <path d="M5.2 13.5c3.3-5.4 10.3-5.4 13.6 0" />
    </svg>
  );
}

export function IconUndo() {
  return (
    <svg {...ATTR}>
      <path d="M8.5 6.5L4.5 10l4 3.5" />
      <path d="M4.5 10H14a5.5 5.5 0 11-1.2 9" />
    </svg>
  );
}

export function IconHint() {
  return (
    <svg {...ATTR}>
      <path d="M8 14.2A5.2 5.2 0 1116 14.2C16 16 15.1 17.1 14.1 18.2H9.9C8.9 17.1 8 16 8 14.2z" />
      <path d="M10 18.2h4M10.5 21h3" />
    </svg>
  );
}

export function IconRestart() {
  return (
    <svg {...ATTR}>
      <path d="M20 7.5V12h-4.5" />
      <path d="M19.2 12a7.2 7.2 0 11-2.1-5.1" />
    </svg>
  );
}
