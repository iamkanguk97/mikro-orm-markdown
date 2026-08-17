import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

mermaid.initialize({ startOnLoad: false, theme: 'neutral' });

const tabsEl = document.getElementById('tabs');
const blurbEl = document.getElementById('blurb');
const filePickerEl = document.getElementById('file-picker');
const sourceCodeEl = document.getElementById('source-code');
const outputEl = document.getElementById('output');

const scenarioCache = new Map();
let activeScenarioId;

function showFile(scenario, fileIndex) {
  const file = scenario.files[fileIndex];
  sourceCodeEl.textContent = file.code;
  // Highlighting is cosmetic: if the CDN bundle failed to load, show the code
  // unhighlighted instead of breaking the page.
  if (window.hljs === undefined) {
    return;
  }
  // highlight.js refuses to re-highlight an element it already processed, so
  // reset its marker before each render.
  delete sourceCodeEl.dataset.highlighted;
  window.hljs.highlightElement(sourceCodeEl);
}

async function renderOutput(scenario) {
  outputEl.innerHTML = window.marked.parse(scenario.markdown);
  for (const block of outputEl.querySelectorAll('pre > code.language-mermaid')) {
    const holder = document.createElement('pre');
    holder.className = 'mermaid';
    holder.textContent = block.textContent;
    block.parentElement.replaceWith(holder);
  }
  await mermaid.run({ nodes: outputEl.querySelectorAll('.mermaid') });
}

async function loadScenario(id) {
  if (!scenarioCache.has(id)) {
    const response = await fetch(`./scenarios/${id}.json`);
    scenarioCache.set(id, await response.json());
  }
  return scenarioCache.get(id);
}

async function selectScenario(id) {
  activeScenarioId = id;
  for (const button of tabsEl.querySelectorAll('button')) {
    button.classList.toggle('active', button.dataset.id === id);
  }

  const scenario = await loadScenario(id);
  if (activeScenarioId !== id) {
    return; // a later click won the race
  }

  blurbEl.textContent = scenario.blurb;

  filePickerEl.innerHTML = '';
  scenario.files.forEach((file, fileIndex) => {
    const option = document.createElement('option');
    option.value = String(fileIndex);
    option.textContent = file.name;
    filePickerEl.append(option);
  });
  filePickerEl.onchange = () => showFile(scenario, Number(filePickerEl.value));
  showFile(scenario, 0);

  await renderOutput(scenario);
}

async function init() {
  const response = await fetch('./scenarios/index.json');
  const scenarios = await response.json();

  for (const scenario of scenarios) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.id = scenario.id;
    button.textContent = scenario.title;
    button.addEventListener('click', () => selectScenario(scenario.id));
    tabsEl.append(button);
  }

  await selectScenario(scenarios[0].id);
}

init().catch((error) => {
  blurbEl.textContent = `Failed to load the showcase: ${error.message}`;
  console.error(error);
});
