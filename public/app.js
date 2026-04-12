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

// Delete project modal
const deleteModalOverlay = $('delete-modal-overlay');
const deleteProjectName = $('delete-project-name');
const btnDeleteCancel = $('btn-delete-cancel');
const btnDeleteConfirm = $('btn-delete-confirm');

// Term detail modal
const termModalOverlay = $('term-modal-overlay');
const termModalTitle = $('term-modal-title');
const termStats = $('term-stats');
const termNeighbours = $('term-neighbours');
const termPromptsDetails = $('term-prompts-details');
const termPromptsCount = $('term-prompts-count');
const termPromptsList = $('term-prompts-list');
const btnTermModalClose = $('btn-term-modal-close');

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

    const exportBtn = document.createElement('button');
    exportBtn.className = 'project-action-btn';
    exportBtn.title = 'Export project as CSV';
    exportBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Zm-1-5.573 3.25 3.25a.75.75 0 0 0 1.06 0L9.31 8.427A.75.75 0 0 0 8.25 7.366H6.5V2.75a.75.75 0 0 0-1.5 0v4.616H3.25a.75.75 0 0 0-.53 1.28l-.97-.22Z"/></svg>`;
    exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.location.href = `/api/projects/${p.id}/export`;
    });

    const trashBtn = document.createElement('button');
    trashBtn.className = 'project-action-btn project-delete-btn';
    trashBtn.title = 'Delete project';
    trashBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/></svg>`;
    trashBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDeleteProject(p);
    });

    header.appendChild(chevron);
    header.appendChild(nameEl);
    header.appendChild(exportBtn);
    header.appendChild(trashBtn);
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

/* ===== Delete project ===== */
let pendingDeleteId = null;

function confirmDeleteProject(p) {
  pendingDeleteId = p.id;
  deleteProjectName.textContent = p.name;
  deleteModalOverlay.style.display = 'flex';
}

btnDeleteCancel.addEventListener('click', () => {
  deleteModalOverlay.style.display = 'none';
  pendingDeleteId = null;
});

deleteModalOverlay.addEventListener('click', e => {
  if (e.target === deleteModalOverlay) {
    deleteModalOverlay.style.display = 'none';
    pendingDeleteId = null;
  }
});

btnDeleteConfirm.addEventListener('click', async () => {
  if (pendingDeleteId === null) return;
  const id = pendingDeleteId;
  deleteModalOverlay.style.display = 'none';
  pendingDeleteId = null;
  try {
    await api('DELETE', `/api/projects/${id}`);
    state.projects = state.projects.filter(p => p.id !== id);
    if (state.activeProjectId === id) {
      state.activeProjectId = null;
      activeProjectBadge.style.display = 'none';
      generateStatus.textContent = '';
      updateGenerateButton();
    }
    state.expandedProjects.delete(id);
    renderProjects();
    await loadGraph();
  } catch (e) {
    alert('Delete failed: ' + e.message);
  }
});

/* ===== Right panel controls ===== */
function onApiKeyChange() {
  state.apiKey = apiKeyInput.value.trim();
  localStorage.setItem('bop_api_key', state.apiKey);
  updateGenerateButton();
}
apiKeyInput.addEventListener('input', onApiKeyChange);
apiKeyInput.addEventListener('change', onApiKeyChange);

maxTokensInput.addEventListener('input', () => { maxTokensVal.textContent = maxTokensInput.value; });
temperatureInput.addEventListener('input', () => { tempVal.textContent = parseFloat(temperatureInput.value).toFixed(2); });
keywordsCountInput.addEventListener('input', () => { keywordsVal.textContent = keywordsCountInput.value; });

function updateGenerateButton() {
  btnGenerate.disabled = !apiKeyInput.value.trim() || state.activeProjectId === null;
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
      apiKey: apiKeyInput.value.trim(),
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
  if (state.activeProjectId !== null) params.set('projectId', state.activeProjectId);
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

/* ===== Term detail modal ===== */
btnTermModalClose.addEventListener('click', () => { termModalOverlay.style.display = 'none'; });
termModalOverlay.addEventListener('click', e => { if (e.target === termModalOverlay) termModalOverlay.style.display = 'none'; });

async function showTermModal(d) {
  // Reset and show loading state
  termModalTitle.textContent = d.text;
  termStats.innerHTML = '<div class="term-modal-loading">Loading…</div>';
  termNeighbours.innerHTML = '';
  termPromptsList.innerHTML = '';
  termPromptsDetails.open = false;
  termModalOverlay.style.display = 'flex';

  try {
    const params = new URLSearchParams();
    if (state.activeProjectId) params.set('projectId', state.activeProjectId);
    const data = await api('GET', `/api/terms/${d.id}?${params}`);

    // Stats grid
    termStats.innerHTML = `
      <div class="term-stat-card">
        <div class="term-stat-value">${data.freq}</div>
        <div class="term-stat-label">Generations</div>
      </div>
      <div class="term-stat-card">
        <div class="term-stat-value">${data.degree}</div>
        <div class="term-stat-label">Degree</div>
      </div>
      <div class="term-stat-card">
        <div class="term-stat-value">${(data.total_weight || 0).toFixed(1)}</div>
        <div class="term-stat-label">Total Weight</div>
      </div>`;

    // Neighbours
    if (data.neighbours.length === 0) {
      termNeighbours.innerHTML = '<span class="f6 color-fg-muted">No co-occurring terms.</span>';
    } else {
      termNeighbours.innerHTML = data.neighbours.map(n =>
        `<span class="neighbour-chip">${escHtml(n.text)}<span class="chip-weight">${n.weight}</span></span>`
      ).join('');
    }

    // Prompts
    termPromptsCount.textContent = data.prompts.length;
    if (data.prompts.length === 0) {
      termPromptsList.innerHTML = '<div class="prompt-row color-fg-muted">No prompts found.</div>';
    } else {
      termPromptsList.innerHTML = data.prompts.map(p => `
        <div class="prompt-row">
          <div class="color-fg-default">${escHtml(p.prompt)}</div>
          <div class="prompt-meta">${p.model} &middot; ${new Date(p.created_at).toLocaleString()}</div>
        </div>`).join('');
    }
  } catch (e) {
    termStats.innerHTML = `<div class="term-modal-loading color-fg-danger">Error: ${escHtml(e.message)}</div>`;
  }
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ===== D3 Network ===== */
let simulation, svg, linkSel, nodeSel, zoom;

function renderGraph({ nodes, links }) {
  const container = $('network-container');
  const svgEl = $('network-svg');
  const W = container.clientWidth;
  const H = container.clientHeight;

  // Stop any running simulation before clearing the SVG
  if (simulation) { simulation.stop(); simulation = null; }
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

  // Track whether a drag actually moved so we can distinguish click vs drag
  let nodeDragMoved = false;

  // Nodes
  const nodeGroup = g.append('g').attr('class', 'nodes')
    .selectAll('g')
    .data(nodes)
    .enter().append('g')
    .attr('class', 'node')
    .call(d3.drag()
      .on('start', (event, d) => { nodeDragMoved = false; dragstarted(event, d); })
      .on('drag', (event, d) => { nodeDragMoved = true; dragged(event, d); })
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
    .on('mouseout', () => { $('tooltip').style.display = 'none'; })
    .on('click', (event, d) => {
      if (nodeDragMoved) return;
      $('tooltip').style.display = 'none';
      showTermModal(d);
    });

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
