# Bop — Term Network Explorer

**Bop** is a browser-based research tool that sends prompts to a Large Language Model (LLM), extracts domain-relevant keywords from the response, stores everything in a graph database, and renders the resulting term co-occurrence network interactively in real time. It is designed as a lightweight, self-hosted environment for exploratory qualitative and quantitative analysis of AI-generated textual knowledge.

---

## Motivation

The rapid adoption of LLMs in academic and cultural contexts has created a new kind of epistemic object: the machine-generated scholarly text. Understanding *how* these models represent knowledge — which terms cluster together, which concepts appear persistently across different queries, and how thematic networks evolve with varied prompting strategies — is an open methodological challenge.

Bop was built to make that challenge tractable. Rather than treating LLM output as a black box to be consumed, it treats each response as a structured artefact to be dissected, mapped, and compared. The tool gives researchers a live, interactive view of the semantic field produced by a given prompt, accumulated across many generations within a named project.

The name reflects the exploratory, improvisational spirit of the project: like bebop jazz, the tool encourages iterative variation on a theme — changing a prompt slightly, watching the network shift, and building up a corpus of observations over time.

---

## Relevance for Digital Humanities and Cultural Data Analytics

### Knowledge Cartography

One of the enduring concerns of Digital Humanities is the mapping of conceptual space across large corpora. Bop applies this cartographic impulse to a new kind of corpus: the latent knowledge encoded in pre-trained language models. By querying a model repeatedly — varying topic, perspective, or linguistic framing — researchers can chart the associative structure the model has learned, revealing which terms it treats as semantically proximate.

### Critical AI Studies

LLMs are trained on human cultural production and inevitably reflect its biases, blind spots, and canonical hierarchies. Bop provides a structured method for surfacing these patterns. A researcher might ask the model to describe a historical event from multiple national perspectives and compare the resulting term networks, making visible the differential emphasis each framing produces.

### Discourse Analysis at Scale

Traditional discourse analysis depends on close reading of textual samples. Bop extends this with a computational layer: keyword frequency, degree centrality within the co-occurrence network, and cross-generation term persistence all become quantifiable proxies for discursive salience. The graph database stores every generation, enabling longitudinal comparison within a project.

### Iterative Prompt Engineering as Method

In Cultural Data Analytics, the instrument shapes the observation. Bop makes the prompt an explicit methodological variable: researchers can record, annotate, and compare the networks produced by different prompt strategies within the same project, treating prompt engineering itself as a form of hermeneutic practice.

### Reproducibility and Export

All data — generations, terms, weights, and relationships — is stored in a local graph database and exportable as CSV. This supports reproducible workflows: a full project can be archived, shared, or imported into downstream analysis environments (R, Python, Gephi) for further processing.

---

## Development Stack

### Backend

| Component | Technology | Role |
|---|---|---|
| Runtime | Node.js 20+ | Server-side JavaScript execution |
| Web framework | Express 4 | REST API routing and static file serving |
| LLM client | `@anthropic-ai/sdk` | Claude API integration with streaming-ready architecture |
| Graph database | KuzuDB (embedded) | Persistent graph storage; runs in-process, no separate server required |
| Keyword extraction | `stopword` | English stopword removal for TF-based keyword extraction |
| Text processing | Custom TF + bigrams | Unigram and bigram term frequency ranking over combined prompt+response text |

#### Graph Schema (KuzuDB)

```
Node Tables
  Project     (id SERIAL, name STRING, created_at STRING)
  Generation  (id SERIAL, project_id INT64, prompt STRING, response STRING,
               model STRING, created_at STRING)
  Term        (id SERIAL, text STRING)

Relationship Tables
  HAS_GENERATION  Project  → Generation
  MENTIONS        Generation → Term  [weight: DOUBLE]
  CO_OCCURS       Term → Term        [weight: DOUBLE]  (legacy; queries use inline derivation)
```

Co-occurrence edges between terms are derived at query time by traversing the `MENTIONS` paths within a project, ensuring that the graph shown is always strictly scoped to the active project and never polluted by generations from other projects.

### Frontend

| Component | Technology | Role |
|---|---|---|
| Visualisation | D3.js v7 | Force-directed network graph with zoom, pan, and drag |
| Design system | GitHub Primer CSS 21 | Layout, typography, form controls, modals, labels |
| Icons | Google Material Symbols Outlined | Variable-font icon set (weight, fill, optical size axes) |
| State management | Vanilla JS module | Lightweight in-memory state; no build step required |
| Persistence | `localStorage` | API key stored client-side only; never transmitted to the Bop server |

#### Layout

The interface is a fixed three-column shell:

- **Left column (220 px)** — project browser with collapsible generation history, inline export and delete controls
- **Centre column (fluid)** — search bar → D3 network canvas → generation toolbar
- **Right column (280 px)** — LLM parameter controls and last-response preview

### Data Flow

```
User edits prompt → clicks "Generate New"
  → POST /api/generate
      → Claude API (model, max_tokens, temperature, system prompt)
      → Response text
      → Keyword extraction (TF, unigrams + bigrams, stopword removal)
      → KuzuDB writes:
            CREATE Generation node
            CREATE HAS_GENERATION edge
            MERGE Term nodes (get-or-create)
            MERGE MENTIONS edges (Generation → Term, with weight)
      → Return { response, keywords }
  → Frontend: update sidebar, reload graph
      → GET /api/graph?projectId=N
            MATCH project-scoped MENTIONS paths
            Derive co-occurrence counts inline
      → D3 re-renders force-directed network
```

---

## Interface Description

### Left Column — Projects

A scrollable list of named projects. Each project row shows the project name and, on hover, two icon buttons:

- **Download** (`download`) — triggers a CSV export of all generations and extracted terms for that project.
- **Delete** (`delete`) — opens a confirmation modal before permanently removing the project and its generations.

Clicking a project name selects it as the active context (highlighted in blue) and loads its term network into the centre column. A chevron button expands the project to reveal a scrollable list of past generations, each labelled with a truncated version of its prompt.

The **New Project** button at the bottom opens a modal for naming and creating a new project.

### Centre Column — Network

**Search bar** — a text input that filters the visible network live (300 ms debounce). Nodes matching the query are highlighted with a stronger stroke; non-matching nodes remain but are visually de-emphasised. A clear button resets the search.

**Network canvas** — a D3 force-directed graph where:

- **Nodes** represent extracted terms. Radius and fill colour (blue sequential scale) encode term frequency within the active project.
- **Edges** represent co-occurrence: two terms are linked if they appeared in the same generation. Edge thickness encodes co-occurrence count.
- Nodes are **draggable**; the canvas supports **zoom and pan**.
- **Clicking a node** (distinguished from dragging via a movement flag) opens the **Term Detail modal**, which shows:
  - A stats grid: Generations, Degree (unique neighbours), Total Weight
  - Co-occurring term chips with their co-occurrence counts
  - A collapsible, scrollable list of all prompts in the project where the term appears, with model and timestamp metadata

**Generate bar** — fixed at the bottom of the centre column. Shows the active project name as a label badge, a status line (generation progress and term count), and the **Generate New** button (enabled only when both an API key and an active project are present).

### Right Column — Parameters

Top section (scrollable):

| Control | Description |
|---|---|
| Claude API Key | Password field; value stored in `localStorage`, never sent to the Bop server |
| Model | Dropdown: opus-4-6, sonnet-4-6, haiku-4-5 |
| Max Tokens | Slider 128–4096, step 128 |
| Temperature | Slider 0–1.0, step 0.05 |
| System Prompt | Optional textarea for persistent instructions |
| Prompt | Main user prompt textarea |
| Keywords to extract | Slider 5–40; controls how many top-ranked terms are stored per generation |

Bottom section (fixed):

A **Last Response** panel shows the most recent Claude response as scrollable plain text, with a **Copy** button.

---

## Potential Use Cases

### 1. Mapping the Conceptual Field of a Historical Event

A historian studying the memory of the 1918 influenza pandemic could prompt Claude with questions framed from different national, temporal, or disciplinary perspectives — medical history, political history, cultural memory, public health policy — and accumulate a project for each framing. By comparing the resulting term networks, they can identify which concepts (mortality, quarantine, modernity, war) are stable across framings and which are perspective-dependent, producing a cartography of the historiographic field that would otherwise require reading hundreds of sources.

### 2. Tracing Ideological Vocabulary in AI-Generated Political Discourse

A political communication researcher could systematically prompt the model to describe the same policy topic (immigration, climate legislation, welfare reform) using politically marked framings — conservative, progressive, technocratic, populist — and compare the term co-occurrence networks for each. The resulting graphs reveal the differential lexical resources each ideology draws on, making the model's internalized political vocabularies visible and comparable without requiring a large human-annotated corpus.

### 3. Curriculum Design and Knowledge Domain Scoping

An educator designing a new Digital Humanities curriculum could use Bop to explore how the model structures knowledge around foundational concepts (distant reading, cultural analytics, archival silence, postcolonial critique). By generating responses to a set of scoping questions and examining which terms cluster with which, they gain a structured view of how the field is represented in the model's training data — useful both as a starting point for syllabus design and as a critical lens on what the model treats as central versus peripheral.

### 4. Terminology Auditing for Multilingual Cultural Heritage Projects

A cultural heritage institution preparing multilingual metadata standards could query the model in multiple languages about the same object category (manuscript, ritual object, architectural heritage) and compare the term networks produced in each language. Divergences in the networks — terms that are central in one language but absent in another — flag potential gaps or untranslatable concepts in the proposed terminology framework, informing a more culturally sensitive controlled vocabulary.

### 5. Longitudinal Study of Shifting AI Knowledge Representations

A researcher interested in the epistemology of AI could maintain a long-running Bop project, sending the same set of benchmark prompts to successive model versions as they become available (Claude 3, Claude 3.5, Claude 4, etc.). Because all generations and their extracted term networks are stored persistently in KuzuDB and exportable as CSV, the researcher can track how the semantic neighbourhood of key concepts shifts across model versions — a form of longitudinal computational philology applied to machine knowledge rather than human texts.

---

## Running Locally

```bash
# Install dependencies
npm install

# Start the server (default port 3000)
npm start

# Open in browser
open http://localhost:3000
```

The KuzuDB database is created automatically at `./bop_db/` on first run. Add this directory to `.gitignore` (already included) to avoid committing data to version control.

A Claude API key is required for generation. Keys are entered in the right panel and stored in `localStorage`; they are sent only to the Anthropic API endpoint and never to the Bop server process.

---

## Project Structure

```
Bop/
├── server.js          # Express server, KuzuDB logic, API routes
├── package.json
├── .gitignore
├── public/
│   ├── index.html     # Three-column shell, modals
│   ├── app.js         # State management, D3 rendering, API calls
│   └── styles.css     # Layout, Primer overrides, Material Symbols sizing
└── bop_db/            # KuzuDB data directory (git-ignored)
```

---

*Bop is an open-ended research instrument. Its value lies not in any single output but in the accumulation of observations across many prompting sessions — the slow building of a personal, queryable archive of machine-mediated knowledge.*
