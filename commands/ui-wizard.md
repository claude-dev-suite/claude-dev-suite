---
name: ui-wizard
description: Launch the Dev-Suite Configurator dashboard
allowed-tools: Bash
---

Esegui IMMEDIATAMENTE questo comando per avviare la dashboard di configurazione:

```bash
if [ -f "./dev-suite/configurator/dashboard/server.cjs" ]; then node "./dev-suite/configurator/dashboard/server.cjs"; else node "./configurator/dashboard/server.cjs"; fi
```

NON aggiungere altra logica. NON fare controlli. Esegui SOLO il comando sopra.
