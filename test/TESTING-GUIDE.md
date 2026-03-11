# Code Generator — Test Guide

Guida per testare manualmente la funzionalità Code Generator della dashboard dev-suite.

## Prerequisiti

```bash
# 1. Installa dipendenze (dalla root del progetto)
cd configurator/dashboard
npm install

cd server
npm install

# 2. Avvia il backend (porta 3456)
cd configurator/dashboard/server
npm run dev

# 3. In un altro terminale, avvia il frontend (porta 5173)
cd configurator/dashboard
npm run dev
```

Apri il browser su `http://localhost:5173` e clicca sul tab **Code Generator**.

---

## File di test disponibili

```
test/codegen-specs/
├── petstore-openapi.json       # OpenAPI 3.0 — JSON, 6 endpoint, 6 modelli
├── petstore-openapi.yaml       # OpenAPI 3.0 — YAML (stessa API, testa il parser YAML)
├── notifications-asyncapi.json # AsyncAPI 2.6 — 5 canali Kafka, 5 modelli
├── inventory.tsp               # TypeSpec — 5 modelli, 4 interfacce con operazioni CRUD
├── messaging.proto             # Protobuf — 10+ messaggi, 3 servizi gRPC
├── order-process.bpmn          # BPMN — workflow ordini con gateway, parallel, 14 task
├── invalid-spec.json           # JSON non valido (nessun campo openapi/asyncapi)
└── empty.yaml                  # YAML vuoto (test edge case)
```

---

## Test Plan

### Test 1 — OpenAPI JSON (percorso principale)

| Step | Azione | Risultato atteso |
|------|--------|------------------|
| 1.1 | Seleziona tecnologia **OpenAPI** | Card OpenAPI evidenziata, pulsante "Next" attivo |
| 1.2 | Clicca "Next", trascina `petstore-openapi.json` nell'area upload | File accettato, validazione automatica |
| 1.3 | Attendi validazione | Risultato: **Valid**, mostra "Petstore API", versione "3.0.3", 6 endpoint, 6 modelli |
| 1.4 | Clicca "Next" → Step Configure | Lista target disponibili: TypeScript Express/Fastify/NestJS/Koa, Java Spring, Python FastAPI/Flask, Go Gin/Echo |
| 1.5 | Seleziona **TypeScript + Express** | Componenti mostrati: Interfaces, Routes, Validators, Services, Tests |
| 1.6 | Imposta output directory (es. `/tmp/codegen-test`) | Campo accettato |
| 1.7 | Clicca "Next" → Step Preview | Anteprima file tree con file generati previsti |
| 1.8 | Clicca "Next" → Step Generate | Console live mostra progresso, file generati |
| 1.9 | Clicca "Show Files" | Browser file con codice TypeScript: interfacce Pet, Owner, route Express |

### Test 2 — OpenAPI YAML

| Step | Azione | Risultato atteso |
|------|--------|------------------|
| 2.1 | Seleziona **OpenAPI**, carica `petstore-openapi.yaml` | Validazione OK anche con formato YAML |
| 2.2 | Step Configure → seleziona **Java + Spring Boot** | Componenti: POJOs, RestControllers, Bean Validation, Services, Tests |
| 2.3 | Genera | File Java con classi Pet, controller Spring `@RestController` |

### Test 3 — AsyncAPI

| Step | Azione | Risultato atteso |
|------|--------|------------------|
| 3.1 | Seleziona **AsyncAPI**, carica `notifications-asyncapi.json` | Validazione: "Notification Service", versione "2.6.0", 5 canali |
| 3.2 | Step Configure → seleziona **TypeScript + Fastify** | Componenti disponibili |
| 3.3 | Genera | Handler/subscriber per ogni canale (onUserRegistered, onOrderPlaced, etc.) |

### Test 4 — TypeSpec

| Step | Azione | Risultato atteso |
|------|--------|------------------|
| 4.1 | Seleziona **TypeSpec**, carica `inventory.tsp` | Validazione: "InventoryService", modelli Product/Category/StockLevel/Warehouse/StockMovement |
| 4.2 | Step Configure → seleziona **Python + FastAPI** | Componenti: Pydantic Models, Routers, Services, Tests |
| 4.3 | Genera | Modelli Pydantic, router FastAPI con endpoint CRUD per Products, Categories, Stock, Warehouses |

### Test 5 — Protobuf

| Step | Azione | Risultato atteso |
|------|--------|------------------|
| 5.1 | Seleziona **Protobuf**, carica `messaging.proto` | Validazione: messaggi User, Conversation, ChatMessage; servizi UserService, ConversationService, MessageService |
| 5.2 | Step Configure → seleziona **Go + Gin** | Componenti: Structs, Handlers, Services, Tests |
| 5.3 | Genera | Struct Go per ogni messaggio, handler Gin per ogni RPC |

### Test 6 — BPMN

| Step | Azione | Risultato atteso |
|------|--------|------------------|
| 6.1 | Seleziona **BPMN**, carica `order-process.bpmn` | Validazione: processo "Order Processing Workflow", 14 task riconosciuti |
| 6.2 | Step Configure → seleziona **TypeScript + NestJS** | Componenti: DTOs, Controllers, Services, Modules, Tests |
| 6.3 | Genera | Service/controller NestJS per ogni task del workflow (ValidateOrder, CheckInventory, ProcessPayment, etc.) |

### Test 7 — Cambio target durante la configurazione

| Step | Azione | Risultato atteso |
|------|--------|------------------|
| 7.1 | Dopo aver selezionato un target, cambia (es. da Express a Koa) | Lista componenti si aggiorna per il nuovo target |
| 7.2 | Disabilita componente "Validators" | Il toggle si disattiva |
| 7.3 | Genera | I file validators non vengono generati |

### Test 8 — Opzione AI Refinement

| Step | Azione | Risultato atteso |
|------|--------|------------------|
| 8.1 | Nello Step Preview, attiva "AI Refinement" | Toggle attivo |
| 8.2 | Genera e attendi completamento | Appare pulsante "Refine with Claude" |
| 8.3 | Clicca "Refine with Claude" | Job di refinement creato per l'orchestrator |

---

## Test di errore

### Test E1 — File non valido

| Step | Azione | Risultato atteso |
|------|--------|------------------|
| E1.1 | Seleziona **OpenAPI**, carica `invalid-spec.json` | Validazione fallisce con messaggio di errore chiaro |
| E1.2 | Il pulsante "Next" resta disabilitato | Non si può procedere con spec non valida |

### Test E2 — File vuoto

| Step | Azione | Risultato atteso |
|------|--------|------------------|
| E2.1 | Carica `empty.yaml` | Validazione fallisce, messaggio "No valid spec detected" o simile |

### Test E3 — Tecnologia sbagliata

| Step | Azione | Risultato atteso |
|------|--------|------------------|
| E3.1 | Seleziona **Protobuf**, poi carica `petstore-openapi.json` | Validazione dice che non è un file Protobuf valido |

### Test E4 — File troppo grande

| Step | Azione | Risultato atteso |
|------|--------|------------------|
| E4.1 | Prova a caricare un file > 5MB | Errore "File too large. Maximum size is 5MB." |

### Test E5 — Estensione non supportata

| Step | Azione | Risultato atteso |
|------|--------|------------------|
| E5.1 | Prova a caricare un file `.txt` o `.pdf` | Errore "Unsupported file type" |

---

## Test navigazione

| Step | Azione | Risultato atteso |
|------|--------|------------------|
| N1 | Clicca "Back" da qualsiasi step | Torna allo step precedente con dati preservati |
| N2 | Clicca direttamente sullo stepper (step 1) | Torna a Step 1, selezione tecnologia preservata |
| N3 | Cambia tab (es. vai su Orchestrator, poi torna) | Stato del Code Generator preservato |
| N4 | Dopo una generazione, clicca "Back" fino a Step 1 | Tutto resettabile, può iniziare da capo |

---

## Test API diretti (curl)

Se preferisci testare le API senza la UI:

```bash
# Prerequisito: backend attivo su localhost:3456

# 1. Lista target disponibili
curl http://localhost:3456/api/codegen/targets

# 2. Upload file spec
curl -X POST http://localhost:3456/api/codegen/upload \
  -F "spec=@test/codegen-specs/petstore-openapi.json"

# 3. Valida spec (dopo upload, con il contenuto)
curl -X POST http://localhost:3456/api/codegen/validate \
  -H "Content-Type: application/json" \
  -d '{
    "content": "{\"openapi\":\"3.0.3\",\"info\":{\"title\":\"Test\"},\"paths\":{}}",
    "filename": "test.json",
    "technology": "openapi"
  }'

# 4. Preview generazione
curl -X POST http://localhost:3456/api/codegen/preview \
  -H "Content-Type: application/json" \
  -d '{
    "content": "{\"openapi\":\"3.0.3\",\"info\":{\"title\":\"Test\"},\"paths\":{\"/pets\":{\"get\":{\"operationId\":\"listPets\",\"responses\":{\"200\":{}}}}},\"components\":{\"schemas\":{\"Pet\":{\"type\":\"object\",\"properties\":{\"id\":{\"type\":\"string\"}}}}}}",
    "technology": "openapi",
    "targetLanguage": "typescript-express",
    "components": ["models", "routes", "validators", "services"]
  }'

# 5. Genera codice
curl -X POST http://localhost:3456/api/codegen/generate \
  -H "Content-Type: application/json" \
  -d '{
    "content": "{\"openapi\":\"3.0.3\",\"info\":{\"title\":\"Test\"},\"paths\":{\"/pets\":{\"get\":{\"operationId\":\"listPets\",\"responses\":{\"200\":{}}}}},\"components\":{\"schemas\":{\"Pet\":{\"type\":\"object\",\"properties\":{\"id\":{\"type\":\"string\"}}}}}}",
    "technology": "openapi",
    "targetLanguage": "typescript-express",
    "components": ["models", "routes"],
    "outputDir": "/tmp/codegen-test",
    "projectPath": "/tmp/codegen-test"
  }'

# 6. Scan conventions di un progetto
curl -X POST http://localhost:3456/api/codegen/conventions \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "C:/Users/mario/OneDrive/Desktop/projects/business/dev-suite"}'
```

---

## Checklist riepilogativa

- [ ] OpenAPI JSON → validazione → generazione TS Express
- [ ] OpenAPI YAML → validazione → generazione Java Spring
- [ ] AsyncAPI → validazione → generazione TS Fastify
- [ ] TypeSpec → validazione → generazione Python FastAPI
- [ ] Protobuf → validazione → generazione Go Gin
- [ ] BPMN → validazione → generazione TS NestJS
- [ ] File non valido → errore chiaro
- [ ] File vuoto → errore chiaro
- [ ] Tecnologia sbagliata → errore
- [ ] File > 5MB → errore 413
- [ ] Estensione non supportata → errore
- [ ] Navigazione avanti/indietro preserva stato
- [ ] Cambio target aggiorna componenti
- [ ] Toggle componenti funziona
- [ ] AI Refinement toggle + pulsante Refine
- [ ] API curl funzionano standalone
