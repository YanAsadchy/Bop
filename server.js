import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';
import Anthropic from '@anthropic-ai/sdk';
import kuzu from 'kuzu';
import { removeStopwords, eng } from 'stopword';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// --- KuzuDB setup ---
const db = new kuzu.Database(join(__dirname, 'bop_db'));
const conn = new kuzu.Connection(db);

async function initDb() {
  try {
    await conn.query(`CREATE NODE TABLE IF NOT EXISTS Project(id SERIAL, name STRING, created_at STRING, PRIMARY KEY(id))`);
    await conn.query(`CREATE NODE TABLE IF NOT EXISTS Generation(id SERIAL, project_id INT64, prompt STRING, response STRING, model STRING, created_at STRING, PRIMARY KEY(id))`);
    await conn.query(`CREATE NODE TABLE IF NOT EXISTS Term(id SERIAL, text STRING, PRIMARY KEY(id))`);
    await conn.query(`CREATE REL TABLE IF NOT EXISTS HAS_GENERATION(FROM Project TO Generation)`);
    await conn.query(`CREATE REL TABLE IF NOT EXISTS MENTIONS(FROM Generation TO Term, weight DOUBLE)`);
    await conn.query(`CREATE REL TABLE IF NOT EXISTS CO_OCCURS(FROM Term TO Term, weight DOUBLE)`);
    console.log('KuzuDB initialized');
  } catch (e) {
    console.error('DB init error:', e.message);
  }
}

// --- Text analysis: extract keywords using TF-based approach + stopwords ---
function extractKeywords(text, topN = 15) {
  const cleaned = text.toLowerCase().replace(/[^a-z\s'-]/g, ' ').replace(/\s+/g, ' ').trim();
  const rawTokens = cleaned.split(' ').filter(t => t.length > 2);
  const tokens = removeStopwords(rawTokens, eng).filter(t => t.length > 3);

  // Simple bigrams + unigrams
  const freq = {};
  for (const t of tokens) {
    freq[t] = (freq[t] || 0) + 1;
  }
  // Bigrams
  for (let i = 0; i < tokens.length - 1; i++) {
    const bg = `${tokens[i]} ${tokens[i+1]}`;
    freq[bg] = (freq[bg] || 0) + 0.8;
  }

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([term, score]) => ({ term, score }));
}

// --- DB helper: get or create term ---
async function getOrCreateTerm(text) {
  const res = await conn.query(`MATCH (t:Term) WHERE t.text = '${text.replace(/'/g, "\\'")}' RETURN t.id`);
  const rows = await res.getAll();
  if (rows.length > 0) return rows[0]['t.id'];
  const ins = await conn.query(`CREATE (t:Term {text: '${text.replace(/'/g, "\\'")}' }) RETURN t.id`);
  const insRows = await ins.getAll();
  return insRows[0]['t.id'];
}

// --- Routes ---

// Projects
app.get('/api/projects', async (req, res) => {
  try {
    const r = await conn.query(`MATCH (p:Project) RETURN p.id, p.name, p.created_at ORDER BY p.created_at DESC`);
    const rows = await r.getAll();
    res.json(rows.map(r => ({ id: r['p.id'], name: r['p.name'], created_at: r['p.created_at'] })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/projects', async (req, res) => {
  try {
    const { name } = req.body;
    const now = new Date().toISOString();
    const r = await conn.query(`CREATE (p:Project {name: '${name.replace(/'/g, "\\'")}', created_at: '${now}'}) RETURN p.id`);
    const rows = await r.getAll();
    res.json({ id: rows[0]['p.id'], name, created_at: now });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Generations per project
app.get('/api/projects/:projectId/generations', async (req, res) => {
  try {
    const pid = parseInt(req.params.projectId);
    const r = await conn.query(`MATCH (p:Project)-[:HAS_GENERATION]->(g:Generation) WHERE p.id = ${pid} RETURN g.id, g.prompt, g.response, g.model, g.created_at ORDER BY g.created_at DESC`);
    const rows = await r.getAll();
    res.json(rows.map(r => ({ id: r['g.id'], prompt: r['g.prompt'], response: r['g.response'], model: r['g.model'], created_at: r['g.created_at'] })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Generate: call Claude, extract keywords, store in DB
app.post('/api/generate', async (req, res) => {
  const { prompt, projectId, apiKey, model = 'claude-opus-4-6', maxTokens = 1024, temperature = 1.0, systemPrompt = '' } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'API key required' });
  if (!projectId) return res.status(400).json({ error: 'Project required' });

  try {
    const client = new Anthropic({ apiKey });
    const msgParams = {
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    };
    if (systemPrompt) msgParams.system = systemPrompt;

    const message = await client.messages.create(msgParams);
    const response = message.content[0].text;

    // Store generation
    const now = new Date().toISOString();
    const safeProm = prompt.replace(/'/g, "\\'");
    const safeResp = response.replace(/'/g, "\\'").replace(/\n/g, ' ');
    const safeModel = model.replace(/'/g, "\\'");
    const gRes = await conn.query(`CREATE (g:Generation {project_id: ${projectId}, prompt: '${safeProm}', response: '${safeResp}', model: '${safeModel}', created_at: '${now}'}) RETURN g.id`);
    const gRows = await gRes.getAll();
    const genId = gRows[0]['g.id'];

    // Link to project
    await conn.query(`MATCH (p:Project), (g:Generation) WHERE p.id = ${projectId} AND g.id = ${genId} CREATE (p)-[:HAS_GENERATION]->(g)`);

    // Extract keywords
    const keywords = extractKeywords(prompt + ' ' + response);
    const termIds = [];
    for (const kw of keywords) {
      const termId = await getOrCreateTerm(kw.term);
      termIds.push({ termId, weight: kw.score });
      await conn.query(`MATCH (g:Generation), (t:Term) WHERE g.id = ${genId} AND t.id = ${termId} MERGE (g)-[r:MENTIONS {weight: ${kw.score}}]->(t)`);
    }

    // Co-occurrence edges between all term pairs
    for (let i = 0; i < termIds.length; i++) {
      for (let j = i + 1; j < termIds.length; j++) {
        const a = termIds[i].termId;
        const b = termIds[j].termId;
        const w = Math.min(termIds[i].weight, termIds[j].weight);
        await conn.query(`MATCH (a:Term), (b:Term) WHERE a.id = ${a} AND b.id = ${b} MERGE (a)-[r:CO_OCCURS {weight: ${w}}]->(b)`);
      }
    }

    res.json({ generationId: genId, response, keywords });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Graph data for visualization — edges derived from MENTIONS to stay project-scoped
app.get('/api/graph', async (req, res) => {
  try {
    const { projectId, search } = req.query;
    const searchClause = search && search.trim()
      ? `AND toLower(t.text) CONTAINS '${search.trim().toLowerCase().replace(/'/g, "\\'")}'`
      : '';

    let nodeQuery, edgeQuery;

    if (projectId) {
      // Nodes: terms mentioned in this project's generations
      nodeQuery = `MATCH (p:Project)-[:HAS_GENERATION]->(g:Generation)-[:MENTIONS]->(t:Term)
        WHERE p.id = ${projectId} ${searchClause}
        RETURN DISTINCT t.id AS id, t.text AS text, count(g) AS freq`;
      // Edges: co-occurrence derived inline, scoped to this project only
      edgeQuery = `MATCH (p:Project)-[:HAS_GENERATION]->(g:Generation)-[:MENTIONS]->(a:Term),
          (g)-[:MENTIONS]->(b:Term)
        WHERE p.id = ${projectId} AND a.id < b.id
        RETURN a.id AS source, b.id AS target, count(g) AS weight`;
    } else {
      nodeQuery = search && search.trim()
        ? `MATCH (t:Term) WHERE toLower(t.text) CONTAINS '${search.trim().toLowerCase().replace(/'/g, "\\'")}' RETURN t.id AS id, t.text AS text, 1 AS freq`
        : `MATCH (t:Term) RETURN t.id AS id, t.text AS text, 1 AS freq LIMIT 200`;
      edgeQuery = `MATCH (g:Generation)-[:MENTIONS]->(a:Term), (g)-[:MENTIONS]->(b:Term)
        WHERE a.id < b.id
        RETURN a.id AS source, b.id AS target, count(g) AS weight LIMIT 300`;
    }

    const nRes = await conn.query(nodeQuery);
    const eRes = await conn.query(edgeQuery);
    const nodes = await nRes.getAll();
    const edges = await eRes.getAll();

    res.json({
      nodes: nodes.map(n => ({ id: n.id, text: n.text, freq: n.freq })),
      links: edges.map(e => ({ source: e.source, target: e.target, weight: e.weight }))
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Term detail: stats + neighbours + prompts, scoped to a project
app.get('/api/terms/:termId', async (req, res) => {
  try {
    const termId = parseInt(req.params.termId);
    const projectId = req.query.projectId ? parseInt(req.query.projectId) : null;

    const scopeMatch = projectId
      ? `MATCH (p:Project)-[:HAS_GENERATION]->(g:Generation)-[m:MENTIONS]->(t:Term) WHERE t.id = ${termId} AND p.id = ${projectId}`
      : `MATCH (g:Generation)-[m:MENTIONS]->(t:Term) WHERE t.id = ${termId}`;

    // Basic stats
    const statsRes = await conn.query(`${scopeMatch} RETURN t.text AS text, count(DISTINCT g) AS freq, sum(m.weight) AS total_weight`);
    const statsRows = await statsRes.getAll();
    if (!statsRows.length) return res.status(404).json({ error: 'Term not found' });
    const { text, freq, total_weight } = statsRows[0];

    // Neighbours (co-occurring terms in same project scope)
    const nbScopeMatch = projectId
      ? `MATCH (p:Project)-[:HAS_GENERATION]->(g:Generation)-[:MENTIONS]->(t:Term), (g)-[:MENTIONS]->(other:Term) WHERE t.id = ${termId} AND p.id = ${projectId} AND other.id <> ${termId}`
      : `MATCH (g:Generation)-[:MENTIONS]->(t:Term), (g)-[:MENTIONS]->(other:Term) WHERE t.id = ${termId} AND other.id <> ${termId}`;
    const nbRes = await conn.query(`${nbScopeMatch} RETURN other.id AS id, other.text AS text, count(g) AS weight ORDER BY weight DESC LIMIT 20`);
    const neighbours = await nbRes.getAll();

    // Prompts where this term appears
    const promptScopeMatch = projectId
      ? `MATCH (p:Project)-[:HAS_GENERATION]->(g:Generation)-[:MENTIONS]->(t:Term) WHERE t.id = ${termId} AND p.id = ${projectId}`
      : `MATCH (g:Generation)-[:MENTIONS]->(t:Term) WHERE t.id = ${termId}`;
    const pRes = await conn.query(`${promptScopeMatch} RETURN g.id AS id, g.prompt AS prompt, g.created_at AS created_at, g.model AS model ORDER BY g.created_at DESC`);
    const prompts = await pRes.getAll();

    res.json({
      id: termId,
      text,
      freq,
      total_weight,
      degree: neighbours.length,
      neighbours: neighbours.map(n => ({ id: n.id, text: n.text, weight: n.weight })),
      prompts: prompts.map(p => ({ id: p.id, prompt: p.prompt, created_at: p.created_at, model: p.model }))
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Delete project and all its generations
app.delete('/api/projects/:projectId', async (req, res) => {
  try {
    const pid = parseInt(req.params.projectId);
    // Delete MENTIONS edges from this project's generations
    await conn.query(`MATCH (p:Project)-[:HAS_GENERATION]->(g:Generation)-[m:MENTIONS]->(:Term) WHERE p.id = ${pid} DELETE m`);
    // Delete HAS_GENERATION edges
    await conn.query(`MATCH (p:Project)-[r:HAS_GENERATION]->(g:Generation) WHERE p.id = ${pid} DELETE r`);
    // Delete Generation nodes
    await conn.query(`MATCH (g:Generation) WHERE g.project_id = ${pid} DELETE g`);
    // Delete Project node
    await conn.query(`MATCH (p:Project) WHERE p.id = ${pid} DELETE p`);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Health
app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
initDb().then(() => {
  app.listen(PORT, () => console.log(`Bop running on http://localhost:${PORT}`));
});
