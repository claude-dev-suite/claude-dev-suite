# Piano di distribuzione — ottobre 2026

Fonti: `reports/Concorrenti più apprezzati di dev suite.md` (ricerca del 05/10/2026, sei
aree), il registro di esecuzione in [`docs/MARKETING-PLAN.md`](../MARKETING-PLAN.md) e le
serie in `docs/metrics/`. Questo piano non sostituisce il MARKETING-PLAN: ne riordina le
priorità alla luce di cosa distribuisce davvero i prodotti concorrenti.

## La diagnosi in tre righe

1. **L'ingresso facile esiste — l'installer — ma quasi nessuno lo prende.** Il traffico
   arriva da ricerca e aggregatori AI (Google, DuckDuckGo, chatgpt.com, lobehub, skills.sh),
   non dai social. Ogni release pubblica installer per Windows, macOS e Linux, eppure i
   download degli installer delle ultime release sono a una cifra (v1.17.0–v1.19.0: 0-1 per
   l'exe, 3-12 per l'AppImage), contro centinaia di clone unici ogni due settimane. Tre cause:
   - nel README l'installer arriva **dopo** `npx skills add` e `git clone`: in cima c'è solo
     un rimando in nota, la tabella dei download è a metà pagina;
   - gli installer **non sono firmati** (`release.yml`: niente certificato Windows né
     Developer ID Apple): SmartScreen e Gatekeeper mostrano un avviso al primo avvio, che per
     uno strumento che scrive config nei progetti è un freno serio;
   - il pubblico dell'ecosistema si aspetta `npx …` o `/plugin install`: un'app desktop da
     scaricare non entra in CI, nei container, nelle macchine remote, né nei thread di HN
     dove si prova in dieci secondi.
2. **I canali dominanti dell'ecosistema non ci vedono.** Nessun server MCP è su npm, quindi
   registry MCP ufficiale, Smithery, Glama e `add-mcp` (~220k download/settimana, 22+
   assistenti) sono chiusi a monte. L'unico canale attivo per costruzione è skills.sh, e
   installa solo le skill.
3. **Non abbiamo prove.** Il mercato punisce i numeri non misurati (Ruflo) e premia il
   "vanilla" nell'unico confronto pubblico. I nostri vantaggi reali — segreti per
   riferimento, caricamento pigro delle skill, gate sulle descrizioni MCP, rilevamento
   deterministico dello stack — non sono misurati né comunicati.

**Posizionamento da usare ovunque:** *installatore curato e consapevole dello stack per tutti
gli assistenti del progetto*. Non "il catalogo più grande", non "l'orchestratore". Nessun
concorrente trovato unisce rilevamento, contenuto first-party e scrittura nativa per più
assistenti con backup e rollback.

## Principi

- **Prima il prodotto provabile, poi la voce.** Nessun post (HN, Reddit) prima che l'ingresso
  sia senza attrito: un Show HN che rimanda a un installer non firmato, o a "clona e compila",
  brucia l'unico colpo.
- **Ogni affermazione pubblica ha un numero misurato dietro**, o non si fa.
- **Mai conteggi nel copy** (agent, skill, server): vanno stantii e sono il registro di
  Ruflo, non il nostro.
- **Si automatizza il meccanico, non la faccia** (confine già deciso a settembre: HN e
  Reddit vietano l'automazione, le PR bot alle awesome list vengono chiuse).

## Fase 1 — Ingresso senza attrito (settimane 1-3)

La fase che sblocca tutte le altre. Prima si valorizza l'installer che già esiste (1.0a-b,
costo quasi nullo), poi si aggiunge l'ingresso che l'ecosistema si aspetta (1.1-1.4).

| # | Azione | Perché | Fatto quando |
|---|--------|--------|--------------|
| 1.0a | **L'installer in cima al README**: pulsanti di download diretto per OS sopra `git clone`, con link a `releases/latest/download/<asset>` (nomi asset stabili, senza versione, o una pagina che risolve l'ultimo) | Oggi il percorso più semplice è il meno visibile | I download degli installer per release salgono rispetto alla base 0-12 |
| 1.0b | **Firma dell'installer Windows** via SignPath Foundation (gratuito per progetti OSS). **macOS resta non firmato** (decisione del 06/10/2026: niente Apple Developer a pagamento); il README continua a spiegare il clic destro → Apri | Toglie l'avviso SmartScreen al primo avvio, e con esso il dubbio "è sicuro?" | Il job Windows di `release.yml` firma l'exe; nessun avviso su macchina pulita |
| 1.1 | **CLI headless `npx`** (`npx <nome> init`): rilevamento + installazione riusando `detection.service` e `installation.service`, senza Electron. Flag `--targets`, `--yes`, `--dry-run` che stampa cosa installerebbe | È il canale con cui si diffondono rulesync (~350k/sett.), `skills` (~4,2M/sett.), claude-code-templates. Funziona anche in CI e nei container, dove la dashboard non arriva | Da un repo vuoto, un comando produce la stessa installazione del wizard, con manifest e backup |
| 1.2 | **Server MCP precompilati nel pacchetto npm** (o pubblicati come pacchetti `@scope/<server>` con `bin`) | Toglie la build locale — la fonte del guasto Windows di v1.16.0 — e apre i registry MCP | `npx @scope/documentation-server` parte senza clonare il repo |
| 1.3 | **Pubblicare per primi `documentation` e `skill-loader`** come server autonomi | Context7 ha tagliato il free tier del 92% a gennaio: un server di documentazione gratuito ha spazio di posizionamento proprio | Pacchetti su npm, `server.json` pronto per il registry |
| 1.4 | **Marketplace plugin Claude Code** (`.claude-plugin/marketplace.json`) | Riduzione di frizione per chi è già dentro, non acquisizione (analisi del 18-19/09: <1% entra nel catalogo ufficiale). Costo basso | Subordinato alla bonifica di `commands/`; `/plugin marketplace add` installa agent e skill |

**Decisioni (06/10/2026):** approvati 1.0a, 1.1, 1.2/1.3 e 1.4; 1.0b solo per Windows.
Pacchetto proposto: `@claude-dev-suite/cli` (libero su npm il 05/10), con i server MCP sotto
lo stesso scope — serve creare l'organizzazione npm `claude-dev-suite` e un token di
pubblicazione nei secret del repo. La CLI vive nel monorepo e riusa i servizi del server
della dashboard.

## Fase 2 — Prove (settimane 3-5, in parallelo alla coda della fase 1)

| # | Azione | Dettaglio |
|---|--------|-----------|
| 2.1 | **Benchmark pubblico** `docs/BENCHMARK.md` | Pochi repo pubblici fissi (uno per famiglia di stack), task ripetibili, Claude Code senza dev-suite contro Claude Code con dev-suite. Misure: token totali, task riusciti al primo colpo, verifiche passate. Script nel repo, rieseguibile da chiunque. **Si pubblica anche se il risultato è sfavorevole** su qualche task: è ciò che distingue da Ruflo |
| 2.2 | **Misura del costo di contesto** | Token iniettati all'avvio con dev-suite vs installare un catalogo intero (il caso wshobson: avviso da ~404k token). È il numero più facile e più convincente che abbiamo |
| 2.3 | **Pagina sicurezza** in README + `SECURITY.md` | Catalogo first-party, segreti per riferimento e mai letterali nei config, guardie SSRF/path condivise, test di sicurezza della dashboard (pertinente dopo le CVE 9.8 di CloudCLI). Contesto: Snyk, 76 skill malevole; GitGuardian, ~24k segreti nei config MCP |
| 2.4 | **Indice compresso in AGENTS.md** (opportunità di prodotto) | I test di Vercel: indice di docs in AGENTS.md 100% contro 79% delle skill a attivazione automatica. Da misurare con 2.1 prima di dichiararlo |

## Fase 3 — Vetrina e listing (settimane 4-8)

| # | Azione | Dettaglio |
|---|--------|-----------|
| 3.1 | **Catalogo web statico** su GitHub Pages, generato da script come `gen-agents-reference` | Agent, skill e server consultabili; un "che cosa installerebbe per il mio stack" che mostra l'output del `--dry-run`. Più `llms.txt`: i referrer chatgpt.com e lobehub mostrano che gli aggregatori AI ci leggono già |
| 3.2 | **awesome-claude-code** | Il link prefilled è pronto in `docs/release-promo/awesome-claude-code-submission.md`; manca solo l'umano che spunta le attestazioni. Farlo dopo 1.1, così la riga punta a un comando |
| 3.3 | **awesome-mcp-servers** (~96k stelle) e registry MCP (ufficiale, Smithery, Glama, PulseMCP) | Possibile solo dopo 1.2-1.3 |
| 3.4 | **Altre liste e directory** | ComposioHQ/awesome-claude-skills, AlternativeTo, DevHunt. Leggere il CONTRIBUTING di ognuna e usarne il template esatto |
| 3.5 | **skills.sh** | Già attivo. Verificare che la pagina del repo descriva il prodotto completo e rimandi alla CLI |

## Fase 4 — Voce (dalla settimana 6, continuo)

Tutto azione umana. Il materiale si genera con `/release-promote` e `/community-draft`.

| # | Canale | Quando | Gancio |
|---|--------|--------|--------|
| 4.1 | **Show HN** | Solo dopo 1.1 + 2.1 | "Un comando, la configurazione giusta per il tuo stack in ogni assistente — ed ecco i numeri" |
| 4.2 | dev.to / blog | Dopo 2.1 | Un articolo per misura: costo di contesto, benchmark, segreti nei config MCP |
| 4.3 | Reddit (r/ClaudeCode, r/cursor, r/GithubCopilot) | Dopo 4.1, con account con anzianità | Risposte utili nei thread su "troppi agent/token", non post promozionali |
| 4.4 | X, LinkedIn, YouTube | A ogni release che cambia qualcosa di visibile | Video demo: `docs/release-promo/demo-video-outline.md` è pronto |

## Cosa non facciamo

- Product Hunt prima di avere utenti che possano commentare.
- Inseguire le stelle con cataloghi gonfiati o numeri non misurati.
- Pubblicare post automatici fuori da GitHub.
- Dichiarare il marketplace plugin un canale di acquisizione.

## Metriche

Base al 05/10/2026: 39 stelle, 8 fork; referrer della settimana del 28/09 dominati da Google
(119 visite), github.com (72), DuckDuckGo (51), chatgpt.com (20); primi referrer social
(t.co, linkedin.com) con 2-3 visite.

| Metrica | Fonte | Perché conta |
|---------|-------|--------------|
| Download degli installer per release | API GitHub Releases (`download_count`) | L'ingresso che c'è già: misura l'effetto di 1.0a-b. Base: 0-12 per asset nelle ultime tre release |
| Download npm settimanali della CLI e dei server | npm API | L'unica misura di uso, non di interesse |
| Installazioni skills.sh | skills.sh | Canale già attivo |
| Clone unici / visite uniche | `docs/metrics/` (`metrics.yml`) | Conversione visita → prova |
| Referrer non-search | `docs/metrics/referrers.csv` | Se la fase 4 funziona |
| Issue e discussion da utenti esterni | GitHub | Adozione reale, più delle stelle |

Rileggere le metriche alla fine di ogni fase e annotare l'esito nel "Registro di esecuzione"
di `docs/MARKETING-PLAN.md`.
