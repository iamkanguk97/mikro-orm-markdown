import mermaid from 'mermaid';

// Renders every element carrying a `data-mermaid` source and re-renders them when
// Starlight's theme toggle flips <html data-theme>, so diagrams stay readable on
// both light and dark backgrounds.

const SELECTOR = '[data-mermaid]';
let renderCount = 0;

function currentTheme(): 'dark' | 'neutral' {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'neutral';
}

async function renderAll(): Promise<void> {
  mermaid.initialize({ startOnLoad: false, theme: currentTheme() });
  for (const element of document.querySelectorAll<HTMLElement>(SELECTOR)) {
    const source = element.dataset.mermaid ?? '';
    try {
      renderCount += 1;
      const { svg } = await mermaid.render(`mermaid-${renderCount}`, source);
      element.innerHTML = svg;
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
