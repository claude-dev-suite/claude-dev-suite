# Dev-Suite — Open Source Marketing Plan

> Strategia per far crescere l'adozione e la community di Dev-Suite come toolkit open source per Claude Code.

---

## Contesto e Posizionamento

**Dev-Suite** estende Claude Code con agenti specializzati, MCP servers, dashboard visuale e sistema di skills. Il timing è favorevole: il protocollo MCP (introdotto da Anthropic a novembre 2024) è stato definito "lo standard più rapidamente adottato mai visto" (RedMonk), e lo spazio degli strumenti per Claude Code è ancora poco affollato.

**Punti di forza da comunicare:**
- 47 agenti specializzati pronti all'uso
- 10 MCP servers con 79 tool integrati
- 337+ skills con knowledge base on-demand
- Dashboard Electron + orchestratore multi-agente
- MIT license, completamente open source

---

## Fase 1 — Fondamenta (Settimane 1–2, costo zero)

### 1. Ottimizzazione GitHub (GitHub SEO)

Il repo GitHub è il principale canale di distribuzione, non solo un host di codice.

**Azioni:**
- Aggiungere fino a 20 **topics/tags** al repo:
  `claude-code`, `mcp`, `model-context-protocol`, `ai-agents`, `developer-tools`, `anthropic`, `llm`, `devtools`, `typescript`, `electron`, `react`, `open-source`, `code-assistant`, `claude`, `mcp-servers`
- **Description**: "47 specialized agents, 10 MCP servers, and a visual dashboard for Claude Code AI-assisted development"
- **README**: aggiungere una GIF/video demo della dashboard nella prima schermata — chi non vede il prodotto in 5 secondi chiude la pagina
- Aggiungere sezione "Built with Dev-Suite" con esempi concreti di workflow
- Mantenere commit activity alta e visibile (GitHub penalizza i repo stagnanti)

---

### 2. PR agli "Awesome Lists" (backlink permanenti)

Ogni PR approvata = backlink permanente + scoperta passiva continuua.

**Lista target:**
- `sindresorhus/awesome` o liste derivate
- `awesome-mcp` / `awesome-mcp-servers` (GitHub search)
- `awesome-claude` / `awesome-claude-code`
- `awesome-anthropic`
- `awesome-ai-tools`

**Template PR:** descrivere in una riga cosa fa Dev-Suite e perché appartiene alla lista.

---

### 3. Post "Show HN" su Hacker News

HN è il canale con il ROI più alto per tool da sviluppatori: una pagina principale porta 10.000–30.000 visitatori in 24 ore.

**Titolo suggerito:**
> Show HN: Dev-Suite – 47 specialized agents, 10 MCP servers, and a config dashboard for Claude Code

**Regole:**
- Linkare direttamente al repo GitHub (non a un sito)
- Linguaggio tecnico, diretto, senza superlativii marketing
- Postare martedì–giovedì, ore 9–11 ET
- Rimanere attivo nei commenti per le prime 2–3 ore dopo il post
- Se non va in pagina principale, ritentare con angolazione diversa ogni 4–6 settimane

---

### 4. Directory e listing

| Piattaforma | Azione |
|-------------|--------|
| **AlternativeTo** | Creare listing come alternativa al setup manuale di Claude Code |
| **DevHunt** | Sottomettere per featured placement (developer-tool focused) |
| **OpenSourceAlternative.to** | Sottomettere il progetto |
| **LibHunt** | Submit per lista curata |

---

## Fase 2 — Content Engine (Mese 1)

### 5. Blog su DEV Community (dev.to)

Articoli su dev.to appaiono in Google e vengono monitorati dai curator delle newsletter tech.

**Articolo 1 — Storia del progetto:**
> "Come ho trasformato Claude Code in un IDE AI completo"
- Racconta il problema, la soluzione, l'architettura
- Include screenshot della dashboard e degli agenti in azione

**Articolo 2 — Tutorial pratico:**
> "Setup Claude Code con agenti specializzati in 10 minuti"
- Step-by-step con codice, screenshot, e risultati concreti
- Target keyword: "Claude Code agents", "Claude Code MCP servers", "Claude Code setup"

**Cross-posting:** pubblicare anche su Hashnode per audience aggiuntiva.

---

### 6. SEO sull'onda MCP

I contenuti su MCP hanno pochissima concorrenza SEO in questo momento. Articoli tipo:
- *"I migliori MCP servers per sviluppatori nel 2025"*
- *"Cosa sono gli MCP servers e come usarli con Claude Code"*
- *"Claude Code vs Claude Code + Dev-Suite: cosa cambia"*

possono posizionarsi in Google rapidamente e attrarre esattamente il pubblico target.

---

### 7. Reddit — con autenticità

**Subreddit target:** `r/ClaudeAI`, `r/Anthropic`, `r/devtools`, `r/SideProject`, `r/OpenSource`, `r/programming`

**Regola fondamentale:** contribuire per qualche settimana prima di postare il proprio progetto.

**Formato del post:** cosa fa, perché è utile, link al repo — zero linguaggio marketing.

---

### 8. Twitter/X e LinkedIn

**Twitter/X:**
- GIF della dashboard, demo dell'orchestratore, comparazioni prima/dopo
- Tag `@AnthropicAI` su post rilevanti — hanno reshared progetti della community
- Rispondere ai thread sull'ecosistema MCP e Claude Code
- Frequenza: 3–5 post/settimana

**LinkedIn:**
- Formato "Questa settimana ho rilasciato X" con screen recording breve
- Audience di tech lead e engineering manager che prendono decisioni sui tool
- Frequenza: 2–3 post/settimana (i post LinkedIn durano molto più di Twitter)

---

## Fase 3 — Amplificazione (Mesi 2–3)

### 9. Newsletter — Pitch editoriale

Strategia: pubblicare un articolo che fa trending su HN o dev.to → i curator delle newsletter lo raccolgono automaticamente. In alternativa, contatto diretto.

| Newsletter | Audience | Azione |
|-----------|---------|--------|
| **console.dev** | Developer tools, ~50K | Pitch diretto (coprono esattamente tool come Dev-Suite) |
| **TLDR AI** | AI developers, 1M+ | Submission via form |
| **The Changelog** | Open source devs | Pitch alla sezione "News" |
| **JavaScript Weekly** | JS/TS ecosystem | Submit articolo rilevante |
| **daily.dev** | Developer news | Submit post per il feed |

---

### 10. Product Hunt / DevHunt

Da usare per una milestone significativa: v2.0, nuova feature importante, o lancio dell'Electron app come prodotto standalone.

**Preparazione:**
- Maker comment pronto
- Video demo 60–90 secondi
- 5+ screenshot della dashboard
- Costruire una rete di hunter prima del lancio

**Nota:** DevHunt (developer-tool focused) può avere un'audience più qualificata per questo tipo di tool.

---

### 11. Developer Advocates

I testimonial di terze parti valgono 10x l'auto-promozione.

**Azioni:**
- Identificare 5–10 sviluppatori che usano Claude Code regolarmente
- Offrire early access e supporto per scrivere blog post o registrare demo
- Creare una sezione "Built with Dev-Suite" nel README con i loro progetti

---

### 12. YouTube — Evergreen content

I video tutorial per developer tools rankano su Google e fungono da documentazione viva.

**Video prioritari:**
1. "Getting started with Dev-Suite in 5 minutes"
2. "How to install MCP servers with the dashboard"
3. "Building a full-stack project with Claude Code agents"

---

## Piano Azione Prioritizzato

| Priorità | Azione | Impatto atteso | Sforzo |
|---|---|---|---|
| 1 | Aggiungere 20 GitHub topics | SEO passivo permanente | Basso |
| 2 | GIF/video demo nel README | Conversion rate +++ | Medio |
| 3 | PR su 3–5 awesome-lists | Backlink + scoperta | Basso |
| 4 | Show HN post | 5k–30k visite in 24h | Medio |
| 5 | 2 articoli su dev.to | SEO + newsletter pickup | Alto |
| 6 | Listing AlternativeTo + DevHunt | Scoperta passiva | Basso |
| 7 | Post Twitter/LinkedIn 3x/settimana | Community building | Basso/continuo |
| 8 | Pitch console.dev + TLDR | Amplificazione | Medio |
| 9 | Product Hunt launch (v2.0) | Visibilità + credibilità | Alto |
| 10 | YouTube "Getting Started" | Evergreen traffic | Alto |

---

## Metriche da Tracciare

- **GitHub Stars** — indicatore primario di adozione
- **GitHub Forks** — segnale di uso attivo
- **Clone count** (GitHub Traffic tab) — reach reale
- **Referral sources** (GitHub Traffic) — quali canali convertono
- **Issue/Discussion activity** — salute della community
- **npm downloads** (se pubblicato) — uso come libreria

---

## Note Strategiche

- **Non scrivere mai exact counts nel README** — i numeri invecchiano male; preferire frasi tipo "dozens of specialized agents" o derivare dinamicamente
- **Consistency > virality** — post regolari su LinkedIn/Twitter compounding nel tempo
- **La finestra MCP è aperta ora** — la concorrenza SEO su questo topic è ancora bassa; muoversi velocemente
- **Community prima dei numeri** — 100 utenti attivi valgono più di 10.000 star passive

---

## Fase 4 — Automazione via Claude (Costo zero, effort minimo dopo setup)

Questa fase trasforma ogni attività di promozione in un processo ripetibile, eseguibile con un singolo comando Claude Code.

---

### 13. Pipeline di Release — `/release-promote`

Ogni nuovo tag di versione diventa l'ingresso per generare automaticamente tutti i contenuti promozionali.

**Comando:** `/release-promote v1.2.0`

**Output generato in `docs/release-promo/{VERSION}/`:**

| File | Contenuto |
|------|-----------|
| `hacker-news.md` | Post "Show HN" pronto da incollare (titolo + corpo tecnico) |
| `twitter-thread.md` | Thread X da 6–8 tweet con hook, highlights e CTA |
| `linkedin.md` | Post LinkedIn formato storytelling (150–300 parole) |
| `reddit.md` | Due post separati per r/ClaudeAI (casual) e r/devtools (tecnico) |
| `devto-outline.md` | Outline articolo dev.to con titolo, sezioni e punti chiave |
| `awesome-list-entry.md` | One-liner per awesome list submissions |

Claude legge automaticamente CHANGELOG.md, conta agenti/skills/MCP servers dal filesystem, e genera contenuti contestualizzati sulla release.

**Tempo umano richiesto:** 10–15 minuti per review e posting (da ~3 ore senza automazione).

---

### 14. PR su Awesome Lists — `/awesome-list-pr`

**Comando:** `/awesome-list-pr mcpso/awesome-mcp-servers`

Genera PR title, body completo conforme alle linee guida del repository target, e il one-liner formattato correttamente per essere inserito nel file della lista.

**Liste target prioritarie (PR da aprire una volta sola):**

| Repository | Audience | Priorità |
|-----------|---------|---------|
| `mcpso/awesome-mcp-servers` | Sviluppatori MCP | Alta |
| `punkpeye/awesome-mcp-servers` | Sviluppatori MCP | Alta |
| qualsiasi `awesome-claude-code` | Utenti Claude Code | Alta |
| `awesome-ai-tools` | Broad AI devs | Media |
| `awesome-anthropic` | Brand-aligned | Media |

Ogni PR approvata è un backlink permanente e una fonte di scoperta passiva continuua.

---

### 15. Community Engagement — `/community-draft`

**Comando:** `/community-draft [URL o testo incollato]`

Claude legge il contesto della discussione (GitHub issue, thread HN, post Reddit, commento dev.to) e genera due varianti di risposta:
- **Variante A**: risposta puramente utile, senza menzione di dev-suite
- **Variante B**: risposta utile + menzione naturale di dev-suite dove genuinamente rilevante

Claude raccomanda quale usare e perché. Mai spam — solo quando dev-suite risolve concretamente il problema discusso.

**Tracking:** ogni engagement viene loggato in `docs/community-engagement-log.md`.

---

### 16. GitHub Automation (Zero effort dopo setup)

I workflow in `.github/workflows/community.yml` automatizzano:

| Automazione | Trigger | Effetto |
|-------------|---------|---------|
| **Welcome bot** | Prima issue/PR di un utente | Messaggio di benvenuto + guide utili |
| **Auto-labeling** | Ogni PR aperta | Label automatica basata sui file modificati |
| **Stale bot** | Daily (06:00 UTC) | Chiude issue inattive dopo 60+14 giorni |

Il file `.github/release.yml` configura la generazione automatica delle release notes categorizzate per tipo (agenti, skills, MCP, bug fix, docs).

---

### 17. Contenuto Settimanale — Scheduled via Claude

Usare il comando `/schedule` di Claude Code per creare un agent schedulato settimanale:

```
/schedule weekly Monday 09:00 "Leggi gli ultimi 7 commit di dev-suite, guarda le GitHub star/fork della settimana, e genera 3 post social (1 LinkedIn + 2 tweet) sul progresso del progetto. Salva in docs/weekly-social/"
```

**Output:** ogni lunedì mattina, contenuto social pronto da postare per la settimana.

---

## Piano Azione Aggiornato — Con Automazione Claude

| Priorità | Azione | Come automatizzarla | Impatto |
|---|---|---|---|
| 1 | GitHub topics (20) | Manuale, una-tantum, 10 min | SEO passivo permanente |
| 2 | GIF/video demo nel README | Manuale, una-tantum | Conversion rate +++ |
| 3 | PR su 5 awesome-lists | `/awesome-list-pr` × 5 | Backlink permanenti |
| 4 | Show HN post | `/release-promote` → hacker-news.md | 5k–30k visite in 24h |
| 5 | GitHub community automation | `.github/workflows/community.yml` — già deployato | Onboarding contributors |
| 6 | Release notes automatiche | `.github/release.yml` — già deployato | Credibilità progetto |
| 7 | Post social 3×/settimana | `/schedule` settimanale | Community building |
| 8 | 2 articoli su dev.to | `/release-promote` → devto-outline.md | SEO + newsletter pickup |
| 9 | Community replies autentiche | `/community-draft` on-demand | Trust building |
| 10 | Listing AlternativeTo + DevHunt | Manuale, una-tantum | Scoperta passiva |
| 11 | Pitch console.dev + TLDR AI | Post HN in trending → pickup automatico | Amplificazione |
| 12 | Product Hunt (milestone v2.0) | Manuale | Visibilità + credibilità |

---

## Metriche da Tracciare

- **GitHub Stars** — indicatore primario di adozione
- **GitHub Forks** — segnale di uso attivo
- **Clone count** (GitHub Traffic tab) — reach reale
- **Referral sources** (GitHub Traffic) — quali canali convertono
- **Issue/Discussion activity** — salute della community
- **Awesome-list PRs approvate** — backlink acquisiti
- **Community replies loggati** — `docs/community-engagement-log.md`

---

## Note Strategiche

- **Non scrivere mai exact counts nel README** — i numeri invecchiano male; preferire frasi tipo "dozens of specialized agents" o derivare dinamicamente
- **Consistency > virality** — post regolari su LinkedIn/Twitter compounding nel tempo
- **La finestra MCP è aperta ora** — la concorrenza SEO su questo topic è ancora bassa; muoversi velocemente
- **Community prima dei numeri** — 100 utenti attivi valgono più di 10.000 star passive
- **Claude automation è un moltiplicatore** — ogni azione manuale diventa replicabile a costo zero

---

## Comandi Rapidi

```bash
# Genera tutto il promo content per la release corrente
/release-promote

# Genera PR per una awesome list specifica
/awesome-list-pr mcpso/awesome-mcp-servers

# Bozza risposta per una discussione community
/community-draft https://github.com/org/repo/issues/123

# Setup agent schedulato settimanale per social content
/schedule
```

---

*Piano creato: Marzo 2025 — Aggiornato Aprile 2026 con layer di automazione Claude.*
