import mermaid from 'mermaid';

// Renders every element carrying a `data-mermaid` source and re-renders them when
// Starlight's theme toggle flips <html data-theme>, so diagrams stay readable on
// both light and dark backgrounds.

const SELECTOR = '[data-mermaid]';
let renderCount = 0;

// Diagram colors follow the site palette (src/styles/custom.css). Mermaid needs
// literal colors, so the two sets are mirrored here.
const DIAGRAM_COLORS = {
  light: {
    background: '#ffffff',
    mainBkg: '#eef2f7',
    nodeBorder: '#1d4e89',
    lineColor: '#5b6575',
    textColor: '#18202c',
    rowOdd: '#ffffff',
    rowEven: '#f6f8fb',
  },
  dark: {
    background: '#121722',
    mainBkg: '#1a2130',
    nodeBorder: '#7db0ee',
    lineColor: '#8e99ab',
    textColor: '#e3e8f0',
    rowOdd: '#121722',
    rowEven: '#1a2130',
  },
} as const;

function themeVariables(): Record<string, string> {
  const colors = DIAGRAM_COLORS[document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'];
  return {
    ...colors,
    primaryColor: colors.mainBkg,
    primaryBorderColor: colors.nodeBorder,
    primaryTextColor: colors.textColor,
    nodeTextColor: colors.textColor,
    tertiaryColor: colors.background,
    edgeLabelBackground: colors.background,
    fontFamily: "'IBM Plex Sans', 'IBM Plex Sans KR', sans-serif",
    fontSize: '14px',
  };
}

// Tag primary-key markers so CSS can give them the key color.
function markPrimaryKeys(element: HTMLElement): void {
  for (const node of element.querySelectorAll('text, span, p')) {
    if (node.childElementCount === 0 && node.textContent?.trim() === 'PK') {
      node.classList.add('erd-key-pk');
    }
  }
}

async function renderAll(): Promise<void> {
  mermaid.initialize({ startOnLoad: false, theme: 'base', themeVariables: themeVariables() });
  for (const element of document.querySelectorAll<HTMLElement>(SELECTOR)) {
    const source = element.dataset.mermaid ?? '';
    try {
      renderCount += 1;
      const { svg } = await mermaid.render(`mermaid-${renderCount}`, source);
      element.innerHTML = svg;
      markPrimaryKeys(element);
      element.dataset.rendered = 'true';
    } catch (error) {
      // Show the source instead of a blank box, and keep the reason in the console.
      element.textContent = source;
      element.dataset.rendered = 'error';
      // biome-ignore lint/suspicious/noConsole: a browser-side render failure has no other place to be reported
      console.error('[docs] mermaid render failed', error);
    }
  }
}

if (document.querySelector(SELECTOR)) {
  void renderAll();
  new MutationObserver(() => void renderAll()).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
}
