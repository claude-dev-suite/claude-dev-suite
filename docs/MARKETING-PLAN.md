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

---

## Registro di esecuzione

Il piano sopra è stato scritto a marzo 2025 e aggiornato ad aprile 2026, ma fino a
settembre 2026 non era stato eseguito: nessuna directory `docs/release-promo/`, log di
engagement vuoto, zero issue aperte. Questa sezione registra cosa e' stato fatto davvero,
con la data. Aggiornarla ad ogni azione, altrimenti il piano torna a essere teoria.

### Dati di partenza (11 settembre 2026)

| Metrica | Valore |
|---------|--------|
| Star / fork | 33 / 6 |
| Visite uniche (14 gg) | 200 |
| Clone unici (14 gg) | 581 |
| Referrer principali | Google, Bing, lobehub.com, github.com, chatgpt.com, skills.sh |
| Issue aperte | 0 |
| Discussion | 0 |

Lettura: il traffico arriva da ricerca e aggregatori AI, non dai social. La conversione
visita → star è bassa e non esisteva nessun punto d'ingresso per i contributor.

### Eseguito

| Data | Azione | Riferimento |
|------|--------|-------------|
| 2026-09-11 | README con hero, diagramma e quick start sopra la piega; CONTRIBUTING con i quattro track; template issue per skill e agent | PR #204 |
| 2026-09-11 | 11 issue di funnel contributor (8 `good first issue`) | #205-#215 |
| 2026-09-11 | Discussion "What should dev-suite cover next?" e "What did you install dev-suite into?" | #216, #217 |
| 2026-09-11 | Topic del repo portati a 20, con i target multi-assistant | - |
| 2026-09-11 | Contenuto promozionale v1.15.0 generato | `docs/release-promo/v1.15.0/` |
| 2026-09-12 | Primo contributor esterno: PR sulla issue dei test `useApi` | #219 |
| 2026-09-12 | Quattro workflow di automazione community | `metrics`, `contributor-queue`, `claim`, `release-checklist` |

### Cosa è automatico da qui in avanti

| Automazione | Quando parte | Cosa fa da sola |
|-------------|--------------|-----------------|
| `metrics.yml` | lunedì 06:30 UTC | Salva views/clone/referrer in `docs/metrics/`, che l'API cancella dopo 14 giorni |
| `contributor-queue.yml` | ogni giorno 07:00 UTC | Riapre la coda good-first-issue quando scende sotto 5; segnala le PR esterne ferme da 48h |
| `claim.yml` | commento `/claim` | Assegna l'issue o la etichetta `claimed` |

Nessuna di queste pubblica nulla all'esterno: i post restano un'azione umana, per scelta e
perché HN e Reddit vietano l'automazione.

C'era anche `release-checklist.yml`, che apriva una issue di promozione a ogni tag stabile.
Rimosso il 21 settembre 2026. Ne aveva aperte tre — v1.16.0, v1.16.1, v1.17.0 — tutte
identiche e nessuna mai chiusa, perché il promemoria non era la parte mancante: la copy
esisteva già in `docs/release-promo/`, e ciò che non c'era era il momento di pubblicarla.
Un robot che ricorda una cosa che sai già è rumore, e tre issue aperte sullo stesso lavoro
somigliano a un backlog senza esserlo.

### 18-19 settembre 2026 — l'analisi che ha ribaltato le priorità

Una settimana dopo il primo intervento le metriche si erano mosse pochissimo: 35 star (da 33),
7 fork, 207 visite uniche (da 200), 676 cloni unici (da 581), **zero referrer social**, le due
discussion senza un commento, e la issue #232 "Promote v1.16.0" aperta dal workflow e mai toccata.
La domanda di partenza era se spedire dev-suite come plugin marketplace di Claude Code. Sei agenti
in parallelo hanno indagato il tema, e la risposta ha cambiato l'ordine del piano.

**Il marketplace non è un canale di acquisizione.** Su ~35.000 repo con `marketplace.json`, 2.282
entrano nel catalogo community di Anthropic (6,5%) e 309 in quello ufficiale (<1%), dove la
documentazione dice testualmente che *"non esiste un processo di candidatura"*. Su 30 plugin
community campionati, **0 sono raggiungibili** sulla directory pubblica claude.com/plugins. La
scheda Discover in `/plugin` mostra solo i marketplace già aggiunti dall'utente, quindi non può
per costruzione far scoprire il progetto. Nessuna correlazione fra marketplace e crescita su 13
progetti comparabili: `awesome-claude-code` ha 54.262 star e non ne ha mai spedito uno. Va messo
a budget come riduzione di frizione, non come acquisizione.

**Il canale che funziona già esiste e non l'aveva impostato nessuno.** skills.sh (Vercel) elenca
dev-suite con **14.400 installazioni**. Calibrato sul meccanismo "aggiungi il repo, ti prendi
tutto il set" (wshobson: 12.021 installazioni per skill, dev-suite: 31,6), corrisponde a ~30
installazioni dell'intera suite — coerente con le star, quindi non è adozione nascosta. Ma è
distribuzione reale, automatica, e copre tutti e sette gli assistenti.

**Il posizionamento si sabotava da solo.** La descrizione del repo diceva *"...for Claude Code"*:
la stringa che ogni indicizzatore replica, in contraddizione con la prima riga del README.

**Eseguito il 19 settembre:**

| Azione | Dettaglio |
|--------|-----------|
| Descrizione repo riscritta | Via "for Claude Code", dentro tutti e sette gli assistenti |
| Topic ribilanciati | Tolti `electron`, `react`, `typescript`, `devtools` (dettagli implementativi); messi `codex-cli`, `cline`, `kimi-code`, `agents-md`. Il tetto GitHub è 20 |
| `npx skills add` nel README | Sopra il `git clone`, dichiarando che installa **solo** le skill |
| 15 SKILL.md senza frontmatter | Vedi sotto — la scoperta più concreta |
| Gate rinforzato | `validate-frontmatter.mjs` ora fallisce su un `SKILL.md` privo di frontmatter |

**I 15 SKILL.md.** Provando `npx skills add` prima di metterlo nel README, il CLI ne saltava una
quindicina: nessun blocco frontmatter, quindi niente `name` e `description`, che lo spec Agent
Skills rende obbligatori. Le categorie `animation/`, `graphics/` e `codegen/` erano **invisibili
al completo**. `validate-frontmatter.mjs` non li vedeva perché salta di proposito i file senza
frontmatter (per tollerare README e quick-ref), un'esenzione che copriva anche i SKILL.md. Da 720
skill discoverable a 736.

### 20 settembre 2026 — v1.16.1 e lo sblocco dei post

Il materiale promozionale era stato scritto e **trattenuto deliberatamente**: v1.16.0
lasciava ogni utente Windows con zero MCP server compilati e nessun avviso, quindi
annunciarla avrebbe portato gente nuova su un'installazione rotta in silenzio. La issue
#232 lo diceva già da sola: *"Don't announce before the artefacts are verified."*

v1.16.1 (PR #247, cinque commit) corregge il build Windows, l'abort del launcher su macOS
di serie, il leak dei comandi maintainer-only in `/sync-dev-suite`, quindici SKILL.md
senza frontmatter e la deriva della documentazione dei comandi. Tutti e tre i runner
verdi, asset completi su Windows/macOS/Linux, `prerelease: false`.

Con i fix pubblicati il vincolo decade: i testi sono passati a
`docs/release-promo/v1.16.1/` e l'avviso in testa è stato sostituito con il via libera.

**Restano da pubblicare** — è l'unico passo che nessuna automazione può fare al posto del
maintainer. Account disponibili: X, YouTube, LinkedIn. Niente HN né Reddit, che erano i
numeri 3 e 4 del piano per ROI; crearli ora serve per fra qualche settimana, non per
questa release, perché entrambi pesano l'anzianità dell'account.

### Non ancora eseguito

- Pubblicazione dei post (HN, Reddit, LinkedIn, X, dev.to) - i testi sono pronti in
  `docs/release-promo/v1.15.0/`, mancano gli account e la finestra di posting.
  Per v1.16.0 non è stato ancora generato nulla: la issue #232 è la traccia
- PR alle awesome list - candidati e one-liner in `awesome-list-entry.md`.
  Nota: `hesreallyhim/awesome-claude-code` ha già chiuso la issue #1324 come
  `not_planned`, proposta col titolo "Claude Code toolkit"
- Listing su directory (AlternativeTo, DevHunt, registry MCP). **I registry MCP sono
  bloccati a monte**: nessuno dei server è pubblicato su npm, e il registry ufficiale
  accetta solo npm e PyPI
- Estensione Gemini CLI (topic `gemini-cli-extension` + `gemini-extension.json`) —
  da decidere: il formato estensione non è in `docs/ASSISTANT-FORMAT-REFERENCE.md`,
  che le regole del repo impongono di compilare prima di implementare; e nel merito
  sarebbe in gran parte vuota, perché gli MCP server richiedono `dist/` che non è
  committato e le skill sono già coperte da `npx skills add`
- Marketplace plugin, ridimensionato a riduzione di frizione — subordinato alla
  bonifica dei comandi in `commands/`, oggi fermi a febbraio 2026
- Video demo della dashboard
