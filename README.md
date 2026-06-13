# LookAI

> **Local agentic coding harness** — działający w całości na modelach lokalnych, wzorowany architektonicznie na Claude Code.

[![Build](https://img.shields.io/badge/build-passing-brightgreen)]()
[![Tests](https://img.shields.io/badge/tests-69%2F69-brightgreen)]()
[![Lint](https://img.shields.io/badge/lint-clean-brightgreen)]()

---

## Czym jest LookAI

Model-agnostyczny "harness" agentowy: pętla agentowa (routing po `stop_reason`) + narzędzia (filesystem / shell / web / task) + system uprawnień + zarządzanie kontekstem + pamięć, z interfejsem skupionym na konwersacji. Agent czyta kod, edytuje pliki, uruchamia komendy i testy, sam się poprawia — **lokalnie, bez chmury, bez kosztu/token**.

### Kluczowe cechy

- **Dual-model routing**: Worker (Qwen2.5-Coder-7B, rezydentny GPU) dla narzędzi/edycji + Mózg (Qwen3 30B-A3B, na żądanie CPU) dla planowania
- **Tool-use walidowany Zodem**: każde wywołanie narzędzia walidowane, re-prompt przy błędzie (max 2 próby)
- **Auto-kompakcja kontekstu**: ~70% budżetu, LOOKAI.md przeżywa kompakcję
- **Sandbox Docker/WSL2**: efemeryczne kontenery per zadanie, egress allowlist
- **MCP client**: stdio + Streamable HTTP transporty, tool discovery
- **Subagenty**: izolowane runtime'y z własnym budżetem, zwracają tylko podsumowanie
- **RAG**: SimpleRag z word-frequency embeddings (zero VRAM, zero external deps)
- **Observability**: lightweight OTel traces + Prometheus metrics (bez external deps)
- **Web UI**: React + Tailwind, zgodne z re-mockiem (kremowe tło, terakota/szałwia)
- **VS Code extension**: inline diff, LSP, chat panel
- **Eval harness**: zestawy zadań + ocena trajektorii
- **Long-running tasks**: planner → generator → evaluator z disk state persistence

---

## Wymagania

| Wymaganie | Wersja | Uwagi |
|---|---|---|
| Node.js | 20+ | LTS |
| pnpm | 9+ | `corepack enable` lub `npm install -g pnpm` |
| Ollama | latest | `ollama serve` musi działać |
| Docker Desktop / WSL2 | opcjonalnie | Dla sandboxa |
| Playwright | opcjonalnie | `npm install -g playwright && npx playwright install chromium` dla computer use |

### Modele (Ollama)

```bash
# Worker — rezydentny na GPU (5-6 GB VRAM)
ollama pull qwen2.5-coder:7b

# Mózg — ładowany na żądanie (CPU offload, ~20 GB RAM)
ollama pull qwen3:30b-a3b
```

> **Uwaga sprzętowa**: 8 GB VRAM to wąskie gardło. Worker musi być rezydentny. Mózg ładować tylko na czas planowania i zwalniać po. Przy 32 GB RAM — zamknąć przeglądarkę/IDE podczas pracy Mózgu. Szczegóły w [`docs/LOCAL_CEILING.md`](docs/LOCAL_CEILING.md).

---

## Szybki start

```bash
# 1. Klonuj repo
git clone <repo-url>
cd Look_AI

# 2. Zainstaluj zależności
pnpm install

# 3. Build wszystkich pakietów
pnpm run build

# 4. Uruchom testy
pnpm run test

# 5. Uruchom TUI (terminal)
cd apps/cli && pnpm run dev

# 6. Uruchom Web UI (przeglądarka)
cd apps/web && pnpm run dev

# 7. Uruchom orchestrator (backend)
cd services/orchestrator && pnpm run dev
```

---

## Architektura

```
monorepo (pnpm workspaces)
│
├── packages/
│   ├── core/          — AgentRuntime: pętla, stan = tablica wiadomości, usage tracker
│   ├── llm/           — gateway + adaptery (Ollama/OpenAI-compat, vLLM, pluggable)
│   ├── tools/         — fs (Read/Write/Edit/Glob/Grep), shell (Bash), task (subagent), computer use, git worktrees
│   ├── mcp/           — klient JSON-RPC 2.0 + transporty (stdio, HTTP), marketplace
│   ├── context/       — assembler promptu, kompakcja, token budgeting
│   ├── memory/        — pliki (LOOKAI.md), transkrypty JSONL, RAG, trajektorie
│   ├── security/      — permissions (rule engine), hooks, path-guard, dynamiczne hooki
│   ├── sandbox/       — kontener efemeryczny + egress proxy
│   ├── shared/        — typy, utils, logger, observability (OTel + Prometheus)
│   └── web/           — web search, fetch, ingest
│
├── apps/
│   ├── cli/           — TUI w Ink (terminal)
│   ├── web/           — React + Tailwind + Vite (przeglądarka)
│   └── ide-vscode/    — rozszerzenie VS Code (inline diff + LSP)
│
├── services/
│   ├── orchestrator/  — API + WebSocket + sesje (Fastify, port 3000/3001)
│   └── eval-harness/  — zestawy zadań + ocena trajektorii
│
└── docs/
    ├── LOCAL_CEILING.md      — sufit lokalny (VRAM/RAM limity, eskalacja OOM)
    └── grafana-dashboard.json  — config dashboardu Grafana
```

---

## Interfejsy

### TUI (Ink — terminal)

```bash
cd apps/cli
pnpm run dev
```

- Konwersacja w centrum, composer na dole, linia statusu
- Zwijany lewy rail (Escape): sesje / pliki / ustawienia
- Inline actions: pigułki narzędzi, diff z Akceptuj/Odrzuć, prośby o uprawnienia
- Kolorowanie wg modelu: terakota = Mózg, szałwia = Worker

### Web UI (React + Tailwind)

```bash
cd apps/web
pnpm run dev
```

- Otwórz `http://localhost:5173`
- WebSocket do orchestratora (`ws://localhost:3001`)
- REST API proxy przez Vite (`/api` → `http://localhost:3000`)
- Ten sam design system co TUI: kremowe tło, terakota/szałwia

### VS Code Extension

```bash
cd apps/ide-vscode
pnpm run build
# Zainstaluj z VSIX lub uruchom w debug mode (F5)
```

- Panel chat w bocznym sidebarze
- Inline diff w edytorze (zielone/czerwone dekoracje)
- LSP: wykrywa `console.log`, `TODO`, `FIXME`

---

## Narzędzia agenta

| Narzędzie | Opis | Model |
|---|---|---|
| `read` | Odczyt pliku z numerami linii, paginacja | Worker |
| `write` | Utworzenie/nadpisanie pliku | Worker |
| `edit` | Str-replace (wymaga wcześniejszego read), staleness check | Worker |
| `glob` | Wyszukiwanie plików po wzorcu, sort po mtime, limit 100 | Worker |
| `grep` | Wyszukiwanie regex w plikach/katalogach | Worker |
| `bash` | Komendy shell w sesji trwałej (cwd i env utrzymane) | Worker |
| `web_search` | Wyszukiwanie w sieci (SearXNG/Brave/Bing) | Worker |
| `web_fetch` | Pobranie strony + ekstrakcja do markdown | Worker |
| `subagent` | Izolowany AgentRuntime (explore/plan/general) | Worker |
| `computer_use` | Sterowanie przeglądarką (Playwright) | Worker |
| `git_worktree` | Zarządzanie git worktrees (swarm) | Worker |

---

## Kalibracja pod modele lokalne

| Parametr | Wartość | Uzasadnienie |
|---|---|---|
| Temperatura (Worker) | 0.1 | Determinizm dla kodu |
| Temperatura (Mózg) | 0.2 | Trochę kreatywności w planowaniu |
| Kontekst Worker | 4K tokens | KV-cache w 8 GB VRAM |
| Kontekst Mózg | 2K tokens | CPU offload, wolniejszy |
| Auto-kompakcja | ~70% budżetu | Zapas na nowe tury |
| Max turns | 25 | Guard przed infinite loop |
| Tool-use retries | 2 | Re-prompt przy złym JSON |
| Subagent budget | 4096 tokens, 2 turns | Ciaśniejszy niż główny |

Szczegóły w [`docs/LOCAL_CEILING.md`](docs/LOCAL_CEILING.md).

---

## Skrypty

```bash
# Root
pnpm run build      # Build wszystkich pakietów
pnpm run test       # Testy wszystkich pakietów
pnpm run lint       # Lint wszystkich pakietów
pnpm run typecheck  # Typecheck wszystkich pakietów
pnpm run clean      # rm -rf dist/

# Per package (np. packages/core)
cd packages/core
pnpm run build
pnpm run test
pnpm run lint
```

---

## Konfiguracja

### `.lookai/` — katalog danych użytkownika (w home)

```
~/.lookai/
├── sessions/           # Transkrypty JSONL
├── tasks/              # Stan long-running tasks
├── trajectories/       # Trajektorie agenta (JSON + index.jsonl)
├── marketplace/        # MCP marketplace state
├── hooks/              # Dynamiczne hooki (.js/.ts)
└── LOOKAI.md           # Pamięć projektu (wstrzykiwana do kontekstu)
```

### `LOOKAI.md`

Plik wstrzykiwany do kontekstu systemowego. Przeżywa kompakcję. Służy jako pamięć projektu — zapisuj tam decyzje architektoniczne, konwencje kodu, itp.

---

## Fazy rozwoju

| Faza | Co dostarczono | Testy |
|---|---|---|
| **Faza 0** | MVP: pętla agentowa, Read/Write/Edit/Bash, walidacja Zod | ✅ |
| **Faza 1** | Wieloplikowy refactor, uprawnienia, kompakcja, `--resume`, dual-model routing, TUI Ink | ✅ |
| **Faza 1.5** | Tryby asystent/agent, web search, upload PDF, pamięć rozmów | ⚠️ Częściowo |
| **Faza 2** | MCP client (stdio + HTTP), sandbox Docker, subagenty, hooks Pre/PostToolUse, vLLM adapter | ✅ |
| **Faza 3** | Orchestrator API + WebSocket, RAG (SimpleRag), OTel traces + Prometheus, eval-harness, long-running task | ✅ |
| **Faza 4** | Web UI (React + Tailwind), VS Code extension, MCP marketplace, trajektorie, sufit lokalny | ✅ |
| **Faza 4+** | Persistencja trajektorii, dynamiczne hooki, full JSON Schema → Zod, LSP, computer use, git worktrees, Grafana config | ✅ |

---

## Licencja

MIT — LookAI zachowuje własną tożsamość (własna nazwa + znak-przysłona). Naśladuje *język* Claude, nie klonuje marki/logo.

---

## Wsparcie / Debug

```bash
# Sprawdź czy Ollama działa
curl http://localhost:11434/api/tags

# Sprawdź VRAM
nvidia-smi  # lub ollama ps

# Logi Ollama
ollama serve  # w osobnym terminalu

# OOM? — ścieżka eskalacji
# 1. Zmniejsz kontekst (4K → 2K → 1K)
# 2. Wyładuj Mózg: ollama stop qwen3:30b-a3b
# 3. Zamknij web UI / IDE / przeglądarkę
# 4. Zatrzymaj Docker (jeśli nie używasz sandbox)
# 5. Przejdź na Worker-only mode
# 6. Użyj Q3_K_M zamiast Q4_K_M dla Mózgu
```

Szczegóły w [`docs/LOCAL_CEILING.md`](docs/LOCAL_CEILING.md).
