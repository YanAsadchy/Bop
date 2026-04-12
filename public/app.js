/* ===== State ===== */
const state = {
  projects: [],
  activeProjectId: null,
  expandedProjects: new Set(),
  graphData: { nodes: [], links: [] },
  searchQuery: '',
  apiKey: localStorage.getItem('bop_api_key') || '',
};

/* ===== DOM refs ===== */
const $ = id => document.getElementById(id);
const projectList = $('project-list');
const btnAddProject = $('btn-add-project');
const btnGenerate = $('btn-generate');
const searchInput = $('search-input');
const btnClearSearch = $('btn-clear-search');
const modalOverlay = $('modal-overlay');
const newProjectName = $('new-project-name');
const btnModalCancel = $('btn-modal-cancel');
const btnModalCreate = $('btn-modal-create');
const activeProjectBadge = $('active-project-badge');
const generateStatus = $('generate-status');
const responsePreview = $('response-preview');
const btnCopyResponse = $('btn-copy-response');
const apiKeyInput = $('api-key');
const modelSelect = $('model-select');
const maxTokensInput = $('max-tokens');
const maxTokensVal = $('max-tokens-val');
const temperatureInput = $('temperature');
const tempVal = $('temp-val');
const systemPromptInput = $('system-prompt');
const userPromptInput = $('user-prompt');
const keywordsCountInput = $('keywords-count');
const keywordsVal = $('keywords-val');

/* ===== Restore persisted settings ===== */
if (state.apiKey) apiKeyInput.value = state.apiKey;

/* ===== API helpers ===== */
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

/* ===== Projects ===== */
async function loadProjects() {
  state.projects = await api('GET', '/api/projects');
  renderProjects();
}

function renderProjects() {
  projectList.innerHTML = '';
  if (state.projects.length === 0) {
    projectList.innerHTML = '<p class="px-2 py-2 f6 color-fg-muted">No projects yet.</p>';
    return;
  }
  for (const p of state.projects) {
    const item = document.createElement('div');
    item.className = 'project-item';

    const header = document.createElement('div');
    header.className = 'project-item-header' + (state.activeProjectId === p.id ? ' active' : '');
    header.dataset.id = p.id;

    const chevron = document.createElement('svg');
    chevron.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    chevron.setAttribute('viewBox', '0 0 16 16');
    chevron.setAttribute('width', '12');
    chevron.setAttribute('height', '12');
    chevron.setAttribute('fill', 'currentColor');
    chevron.className = 'project-chevron octicon' + (state.expandedProjects.has(p.id) ? ' open' : '');
    chevron.innerHTML = '<path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"/>';

    const nameEl = document.createElement('span');
    nameEl.className = 'project-name';
    nameEl.textContent = p.name;

    header.appendChild(chevron);
    header.appendChild(nameEl);
    item.appendChild(header);

    // Generations list (hidden unless expanded)
    const genList = document.createElement('div');
    genList.className = 'generation-list';
    genList.id = `gen-list-${p.id}`;
    genList.style.display = state.expandedProjects.has(p.id) ? 'block' : 'none';
    item.appendChild(genList);

    header.addEventListener('click', (e) => {
      e.stopPropagation();
      selectProject(p.id);
      toggleProjectExpand(p.id, chevron, genList);
    });

    projectList.appendChild(item);

    if (state.expandedProjects.has(p.id)) {
      loadGenerationsInto(p.id, genList);
    }
  }
}

async function loadGenerationsInto(projectId, container) {
  container.innerHTML = '<span class="generation-item color-fg-muted">Loading…</span>';
  try {
    const gens = await api('GET', `/api/projects/${projectId}/generations`);
    container.innerHTML = '';
    if (gens.length === 0) {
      container.innerHTML = '<span class="generation-item color-fg-muted">No generations yet.</span>';
      return;
    }
    for (const g of gens) {
      const el = document.createElement('div');
      el.className = 'generation-item';
      el.title = g.prompt;
      el.textContent = g.prompt.slice(0, 40) + (g.prompt.length > 40 ? '…' : '');
      container.appendChild(el);
    }
  } catch (e) {
    container.innerHTML = `<span class="generation-item color-fg-muted">Error: ${e.message}</span>`;
  }
}

function toggleProjectExpand(id, chevron, genList) {
  if (state.expandedProjects.has(id)) {
    state.expandedProjects.delete(id);
    chevron.classList.remove('open');
    genList.style.display = 'none';
  } else {
    state.expandedProjects.add(id);
    chevron.classList.add('open');
    genList.style.display = 'block';
    loadGenerationsInto(id, genList);
  }
}

function selectProject(id) {
  state.activeProjectId = id;
  renderProjects();
  const p = state.projects.find(p => p.id === id);
  if (p) {
    activeProjectBadge.textContent = p.name;
    activeProjectBadge.style.display = '';
  }
  updateGenerateButton();
  loadGraph();
}

/* ===== New project modal ===== */
btnAddProject.addEventListener('click', () => {
  newProjectName.value = '';
  modalOverlay.style.display = 'flex';
  setTimeout(() => newProjectName.focus(), 50);
});

btnModalCancel.addEventListener('click', () => { modalOverlay.style.display = 'none'; });

btnModalCreate.addEventListener('click', async () => {
  const name = newProjectName.value.trim();
  if (!name) return;
  try {
    const p = await api('POST', '/api/projects', { name });
    state.projects.unshift(p);
    modalOverlay.style.display = 'none';
    selectProject(p.id);
    renderProjects();
  } catch (e) {
    alert('Error: ' + e.message);
  }
});

newProjectName.addEventListener('keydown', e => { if (e.key === 'Enter') btnModalCreate.click(); });
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) modalOverlay.style.display = 'none'; });

/* ===== Right panel controls ===== */
apiKeyInput.addEventListener('input', () => {
  state.apiKey = apiKeyInput.value.trim();
  localStorage.setItem('bop_api_key', state.apiKey);
  updateGenerateButton();
});

maxTokensInput.addEventListener('input', () => { maxTokensVal.textContent = maxTokensInput.value; });
temperatureInput.addEventListener('input', () => { tempVal.textContent = parseFloat(temperatureInput.value).toFixed(2); });
keywordsCountInput.addEventListener('input', () => { keywordsVal.textContent = keywordsCountInput.value; });

function updateGenerateButton() {
  btnGenerate.disabled = !state.apiKey || !state.activeProjectId;
}

/* ===== Search ===== */
let searchDebounce;
searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    state.searchQuery = searchInput.value.trim();
    loadGraph();
  }, 300);
});

btnClearSearch.addEventListener('click', () => {
  searchInput.value = '';
  state.searchQuery = '';
  loadGraph();
});

/* ===== Generate ===== */
btnGenerate.addEventListener('click', async () => {
  const prompt = userPromptInput.value.trim();
  if (!prompt) { generateStatus.textContent = 'Please enter a prompt.'; return; }

  btnGenerate.disabled = true;
  btnGenerate.classList.add('btn-loading');
  generateStatus.textContent = 'Generating…';

  try {
    const result = await api('POST', '/api/generate', {
      prompt,
      projectId: state.activeProjectId,
      apiKey: state.apiKey,
      model: modelSelect.value,
      maxTokens: parseInt(maxTokensInput.value),
      temperature: parseFloat(temperatureInput.value),
      systemPrompt: systemPromptInput.value.trim(),
      keywordsCount: parseInt(keywordsCountInput.value),
    });

    generateStatus.textContent = `Done — ${result.keywords.length} terms extracted.`;
    responsePreview.textContent = result.response;
    btnCopyResponse.style.display = '';
    responsePreview.classList.add('flash-success');
    setTimeout(() => responsePreview.classList.remove('flash-success'), 600);

    // Refresh generations sidebar
    const genList = $(`gen-list-${state.activeProjectId}`);
    if (genList) loadGenerationsInto(state.activeProjectId, genList);

    await loadGraph();
  } catch (e) {
    generateStatus.textContent = 'Error: ' + e.message;
  } finally {
    btnGenerate.classList.remove('btn-loading');
    updateGenerateButton();
  }
});

btnCopyResponse.addEventListener('click', () => {
  navigator.clipboard.writeText(responsePreview.textContent);
  btnCopyResponse.textContent = 'Copied!';
  setTimeout(() => { btnCopyResponse.textContent = 'Copy'; }, 1500);
});

/* ===== Graph ===== */
async function loadGraph() {
  const params = new URLSearchParams();
  if (state.activeProjectId) params.set('projectId', state.activeProjectId);
  if (state.searchQuery) params.set('search', state.searchQuery);

  try {
    const data = await api('GET', `/api/graph?${params}`);
    state.graphData = data;
    renderGraph(data);
    $('network-placeholder').style.display = data.nodes.length ? 'none' : 'flex';
  } catch (e) {
    console.error('Graph load error', e);
  }
}

/* ===== D3 Network ===== */
let simulation, svg, linkSel, nodeSel, zoom;

function renderGraph({ nodes, links }) {
  const container = $('network-container');
  const svgEl = $('network-svg');
  const W = container.clientWidth;
  const H = container.clientHeight;

  // Clear
  d3.select(svgEl).selectAll('*').remove();

  if (!nodes.length) return;

  svg = d3.select(svgEl);

  // Zoom layer
  const g = svg.append('g').attr('class', 'zoom-layer');
  zoom = d3.zoom().scaleExtent([0.2, 5]).on('zoom', e => g.attr('transform', e.transform));
  svg.call(zoom);

  // Colour scale by frequency
  const maxFreq = d3.max(nodes, d => d.freq) || 1;
  const colorScale = d3.scaleSequential(d3.interpolateBlues).domain([0, maxFreq]);

  // Node radius by frequency
  const rScale = d3.scaleSqrt().domain([0, maxFreq]).range([5, 20]);

  // Build a set of node ids for link filtering
  const nodeIds = new Set(nodes.map(n => n.id));
  const filteredLinks = links.filter(l => nodeIds.has(l.source) || nodeIds.has(l.source?.id));

  // Convert link source/target to ids for force sim
  const linkData = filteredLinks.map(l => ({
    source: typeof l.source === 'object' ? l.source.id : l.source,
    target: typeof l.target === 'object' ? l.target.id : l.target,
    weight: l.weight || 1,
  })).filter(l => nodeIds.has(l.source) && nodeIds.has(l.target));

  // Links
  linkSel = g.append('g').attr('class', 'links')
    .selectAll('line')
    .data(linkData)
    .enter().append('line')
    .attr('class', 'link')
    .attr('stroke-width', d => Math.max(0.5, Math.log(d.weight + 1)));

  // Nodes
  const nodeGroup = g.append('g').attr('class', 'nodes')
    .selectAll('g')
    .data(nodes)
    .enter().append('g')
    .attr('class', 'node')
    .call(d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended));

  nodeGroup.append('circle')
    .attr('r', d => rScale(d.freq))
    .attr('fill', d => colorScale(d.freq))
    .attr('stroke', d => d3.color(colorScale(d.freq)).darker(0.5))
    .on('mouseover', (event, d) => {
      const tt = $('tooltip');
      tt.style.display = 'block';
      tt.innerHTML = `<strong>${d.text}</strong><br/>freq: ${d.freq}`;
    })
    .on('mousemove', (event) => {
      const tt = $('tooltip');
      const rect = container.getBoundingClientRect();
      tt.style.left = (event.clientX - rect.left + 12) + 'px';
      tt.style.top = (event.clientY - rect.top - 28) + 'px';
    })
    .on('mouseout', () => { $('tooltip').style.display = 'none'; });

  nodeGroup.append('text')
    .attr('dy', d => rScale(d.freq) + 11)
    .attr('text-anchor', 'middle')
    .attr('font-size', d => Math.max(9, Math.min(13, rScale(d.freq) * 0.8)))
    .text(d => d.text);

  // Highlight search matches
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    nodeGroup.select('circle')
      .classed('highlighted', d => d.text.toLowerCase().includes(q));
  }

  // Simulation
  simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(linkData).id(d => d.id).distance(80).strength(0.5))
    .force('charge', d3.forceManyBody().strength(-120))
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('collision', d3.forceCollide().radius(d => rScale(d.freq) + 4))
    .on('tick', ticked);

  function ticked() {
    linkSel
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);
    nodeGroup.attr('transform', d => `translate(${d.x},${d.y})`);
  }
}

function dragstarted(event, d) {
  if (!event.active) simulation.alphaTarget(0.3).restart();
  d.fx = d.x; d.fy = d.y;
}
function dragged(event, d) { d.fx = event.x; d.fy = event.y; }
function dragended(event, d) {
  if (!event.active) simulation.alphaTarget(0);
  d.fx = null; d.fy = null;
}

/* ===== Resize ===== */
window.addEventListener('resize', () => {
  if (state.graphData.nodes.length) renderGraph(state.graphData);
});

/* ===== Init ===== */
updateGenerateButton();
loadProjects();
loadGraph();
