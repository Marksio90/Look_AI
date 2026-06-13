# LookAI — Faza 3 (Zakończona)

## Cel fazy
Implementacja: orchestrator (API + WebSocket multi-session), RAG (SimpleRag z cosine similarity), observability (OTel traces + Prometheus metrics), eval-harness, long-running task z disk state.

## Co dostarczono

### 1. services/orchestrator — API + WebSocket
- **Orchestrator**: Fastify + WebSocket server, port 3000.
- **SessionManager**: in-memory store z historią wiadomości per session.
- **REST**: POST /sessions, GET /sessions/:id, POST /sessions/:id/message, GET /health.
- **WebSocket**: real-time streaming per session (join/leave/message events).
- **Integracja**: Web UI (Faza 4) będzie łączyć się przez WebSocket.

### 2. packages/memory/rag — SimpleRag
- **SimpleRag**: indeksuje pliki, chunkuje tekst, generuje embeddings (word-frequency vectors — zero external deps, zero VRAM).
- **cosineSimilarity**: ranking wyników wyszukiwania.
- **indexFile() / indexDirectory()**: budowa bazy wiedzy projektu.
- **search()**: top-K wyników z metryką podobieństwa.
- **Kalibracja**: word-frequency embeddings = lekkie, działają na CPU; wystarczające dla kodu źródłowego.

### 3. packages/shared/observability — Tracer + Metrics
- **SimpleTracer**: lightweight OpenTelemetry-compatible tracing (trace/span hierarchy, timing, attributes, events, errors).
- **SimpleSpan**: indywidualne spany z parentId.
- **MetricsRegistry**: Prometheus-compatible metrics (counter, gauge, histogram) z exportem do formatu Prometheus.
- **Zero external deps**: nie ma @opentelemetry/sdk — oszczędza RAM.

### 4. packages/core/task — LongRunningTask
- **Planner → Generator → Evaluator**: wielokrokowe zadania z iteracjami.
- **Disk state**: `.lookai/tasks/{taskId}.json` — zapis/odczyt stanu między krokami.
- **Survives context limit**: stan na dysku, nie w kontekście; można wznowić po restarcie.
- **cleanup()**: usuwa plik stanu po zakończeniu.

### 5. services/eval-harness — Ocena trajektorii
- **EvalHarness**: uruchamia zadania, porównuje output z expected.
- **EvalTask**: definicja z prompt, expected, timeout, tools.
- **EvalResult**: pass/fail ze score, duration, token usage.
- **createDefaultEvalSuite()**: podstawowy smoke test suite.
- **phase3-smoke.test.ts**: 7 testów integracyjnych weryfikujących orchestrator, RAG, observability, long-running task.

## Bramka weryfikacyjna (smoke test)
Scenariusz end-to-end: `phase3-smoke.test.ts` weryfikuje:
- (a) Orchestrator tworzy sesje i przyjmuje wiadomości ✅
- (b) RAG odpowiada z wiedzy projektu (index + search) ✅
- (c) Tracer tworzy spany i eksportuje OTel format ✅
- (d) MetricsRegistry liczy metryki i eksportuje Prometheus ✅
- (e) LongRunningTask zapisuje/odczytuje stan z dysku ✅
- (f) EvalHarness uruchamia suite i raportuje wyniki ✅
- (g) 2+ równoległe sesje via orchestrator ✅

## Stan bramek weryfikacyjnych
| Kryterium | Wynik |
|---|---|
| Build | ✅ Czysty |
| Typecheck | ✅ Czysty |
| Testy jednostkowe | ✅ 45/45 zielone (13 pakietów) |
| Lint | ✅ Czysty (3 warningi `any` w OllamaClient, akceptowalne) |
| Smoke test | ✅ Przechodzi (7 asercji end-to-end) |

## Co NIE zostało zrobione (świadomie odłożone)
- ❌ Web UI (React + Tailwind) — nadal TUI
- ❌ VS Code extension
- ❌ MCP marketplace
- ❌ Zbieranie trajektorii (eval-harness ma runner, nie ma zapisu trajektorii)
- ❌ Sufit lokalny udokumentowany
- ❌ Full Qdrant/Pinecone RAG (SimpleRag wystarcza dla kodu źródłowego)
- ❌ Grafana dashboard (metrics są w formacie Prometheus, brak serwera Grafana)
- ❌ Realne podłączenie serwera MCP (np. filesystem, GitHub)
- ❌ Pełna izolacja Docker w testach

---

# LookAI — Faza 2 (Zakończona)

## Cel fazy
Implementacja: MCP client (JSON-RPC 2.0, stdio + Streamable HTTP), subagenty (izolowane runtime'y), sandbox (Docker/WSL2 ephemeral + egress proxy), hooks (Pre/PostToolUse), vLLM adapter.

## Co dostarczono

### 1. packages/mcp — MCP Client
- **McpClientManager**: lifecycle `initialize → listTools → callTool → shutdown`.
- **Transporty**: `StdioClientTransport` (serwery lokalne) + `StreamableHTTPClientTransport` (zdalne, przez URL).
- **Tool discovery**: `listTools()` zwraca narzędzia z opisami i schematami JSON Schema.
- **Konwersja do LookAI**: `mcpToolToLookaiTool()` tworzy `Tool` z prefixem `serverName_` i walidacją Zod (best-effort JSON Schema → Zod).
- **ReadResource**: `readResource()` — tekst zwracany bezpośrednio, binaria zapisywana do temp i zwracana ścieżka.
- **Rejestracja**: MCP tools rejestrowane w `ToolRegistry` jak natywne narzędzia.

### 2. packages/core/task — Subagenty
- **runSubagent()**: izolowany `AgentRuntime` z własną tablicą wiadomości (bez write/edit).
- **Typy**: `explore` (mapowanie kodu), `plan` (planowanie), `general` (research).
- **Kompakcja 95%**: subagenty mają ciaśniejszy budżet (4096 tokens, preserve 2 turns) niż główny wątek.
- **Bez zagnieżdżania**: subagent nie ma dostępu do `runSubagent`.
- **Zwraca tylko podsumowanie**: ~4000 znaków z powrotem do wątku głównego.

### 3. packages/sandbox — Izolacja wykonania
- **SandboxRunner**: efemeryczny kontener Docker per zadanie (`docker run --rm`).
- **Fallback na host**: gdy Docker niedostępny, uruchamia na hoście z warningiem.
- **Egress allowlist**: `isDomainAllowed()` + `logBlockedEgress()` — domeny poza listą są blokowane i logowane.
- **Bash w sandbox**: `AgentRuntime` wykrywa `bash` + `sandbox` i przekierowuje do kontenera.
- **RAM**: kontener uruchamiany na żądanie, nie trzymany rezydentnie.

### 4. packages/security/hooks — Pre/Post Tool Hooks
- **HookEngine**: rejestracja hooków per `toolPattern` (regex) i `phase` (pre/post).
- **PreToolUse**: może deny (zwraca `ToolResult` z `ok: false`).
- **PostToolUse**: może modyfikować wynik, np. uruchomić testy po edycji.
- **createTestAfterEditHook()**: wbudowany hook PostToolUse na `edit` → uruchamia `pnpm run test`.
- **Integracja**: `AgentRuntime` wywołuje `hookEngine.runPreHooks()` przed dispatch i `runPostHooks()` po.

### 5. packages/llm — vLLM Adapter
- **VllmClient**: extends `OllamaClient` z domyślnym `baseUrl = http://localhost:8000/v1`.
- OpenAI-compatible API — działa z każdym serwerem vLLM (WSL2 lub natywny).

### 6. Integracja w AgentRuntime
- **MCP**: `ToolRegistry` akceptuje narzędzia MCP (prefix `serverName_toolName`).
- **Sandbox**: `bash` tool wykonywany w kontenerze gdy `sandbox` podany w deps.
- **Hooks**: `HookEngine` podłączony do `executeTool` (pre → deny, post → modify).
- **Subagent**: `runSubagent` eksportowany z `@lookai/core` (wymaga `DualModelRouter`).

## Bramka weryfikacyjna (smoke test)
Scenariusz end-to-end: `phase2-smoke.test.ts` weryfikuje:
- (a) MCP tool discovery + konwersja do LookAI Tool ✅
- (b) SandboxRunner uruchamia komendy (fallback na host w testach) ✅
- (c) Egress allowlist blokuje nieautoryzowane domeny ✅
- (d) HookEngine rejestruje i uruchamia pre/post hooks ✅
- (e) Subagent function jest eksportowany i typowany ✅
- (f) MCP tool rejestruje się w ToolRegistry ✅
- (g) Blocked egress log zapisuje odmowy ✅

## Stan bramek weryfikacyjnych
| Kryterium | Wynik |
|---|---|
| Build | ✅ Czysty |
| Typecheck | ✅ Czysty |
| Testy jednostkowe | ✅ 33/33 zielone (11 pakietów) |
| Lint | ✅ Czysty (3 warningi `any` w OllamaClient, akceptowalne) |
| Smoke test | ✅ Przechodzi (7 asercji end-to-end) |

## Co NIE zostało zrobione (świadomie odłożone)
- ❌ Realne podłączenie serwera MCP (np. filesystem, GitHub) — wymaga zewnętrznego serwera MCP do testów integracyjnych
- ❌ Pełna izolacja Docker w testach (brak Docker Desktop w środowisku testowym — fallback na host)
- ❌ Web UI (React + Tailwind) — nadal TUI
- ❌ RAG / wektorowa pamięć
- ❌ VS Code extension
- ❌ Orchestrator API + WebSocket
- ❌ Eval harness
- ❌ Full JSON Schema → Zod converter (best-effort, wystarczający dla prostych schematów)
- ❌ Dynamiczne ładowanie hooków z `.lookai/hooks/` (rejestracja programatyczna)

---

# LookAI — Faza 1 (Zakończona)

## Cel fazy
Rozbudowa Fazy 0 o: nowe narzędzia (Glob, Grep), system uprawnień, zarządzanie kontekstem (kompakcja), pamięć (transkrypty JSONL, --resume), routing dual-model (Mózg/Worker), oraz TUI w Ink.

## Co dostarczono

### 1. packages/tools — rozbudowa
- **Glob** — wyszukiwanie plików po wzorcu glob (`*`, `**`), sort po mtime, limit 100 plików.
- **Grep** — wyszukiwanie treści regex w plikach lub katalogach, zwraca ścieżka:linia:treść.
- **Edit** — `replace_all` (opcjonalny) do zmian masowych.
- **Edit staleness** — porównanie mtime pliku z momentem Read (wymaga rozszerzenia w runtime).

### 2. packages/security — system uprawnień
- **Cztery tryby**: `Default` (pytaj o zmiany), `AutoEdit` (auto-akceptuj edycje), `Plan` (tylko odczyt/analiza), `Auto` (pełna autonomia).
- **Rule engine**: poziomy `ReadOnly < WorkspaceWrite < DangerFull`. Różnica 1 poziom → pytaj; więcej → odmów.
- **Path-guard**: walidacja ścieżek (musi być wewnątrz workspace).
- **Command security**: rozpoznawanie niebezpiecznych komend w Bash (rm -rf, curl | sh, itp.).
- **Inline permission request**: zdarzenie `permission_request` w TurnEvent do renderu w UI.

### 3. packages/context — zarządzanie kontekstem
- **PromptAssembler**: składa system prompt + LOOKAI.md + historia + bieżący prompt.
- **Auto-kompakcja przy ~70% budżetu**: streść starsze wiadomości; zachowaj system/LOOKAI.md i ostatnie N tur dosłownie.
- **ContextBudget**: szacowanie tokenów (4 chars ≈ 1 token).

### 4. packages/memory — pamięć
- **LOOKAI.md**: wstrzykiwany do kontekstu, przeżywa kompakcję.
- **Transkrypty JSONL**: każda sesja zapisywana jako `.jsonl` w `.lookai/sessions/`.
- **--resume**: `MemoryStore` wczytuje ostatnią sesję przy starcie nowej.
- **listSessions()**: lista sesji z sortowaniem po czasie.

### 5. packages/core + packages/llm — routing dual-model
- **DualModelRouter**: zarządza Workerem (`qwen2.5-coder:7b`, rezydentny) i Mózgiem (`qwen3.6-35b-a3b`, ładowany na żądanie).
- **Routing**: tury planowania (pierwsza i co 5-ta) → Mózg; tury narzędziowe → Worker.
- **Eskalacja**: 2× wadliwy tool-use u Workera → reset licznika, komunikat o eskalacji (Mózg w kolejnej turze).
- **AgentRuntime** zintegrowany z `PermissionEngine`, `PromptAssembler`, `MemoryStore`.

### 6. apps/cli — TUI w Ink
- **Layout**: konwersacja w centrum (wycentrowana kolumna), composer na dole, linia statusu.
- **Lewy rail**: zwijany panel (Escape), sesje/pliki/ustawienia.
- **Inline actions**: pigułki narzędzi, wyniki tool_calls, komunikaty systemowe.
- **Kolorowanie wg modelu**: terakota (czerwony) = Mózg, szałwia (zielony) = Worker.
- **Status bar**: aktywny model, tokeny, liczba tur, $0 lokalnie.

## Kalibracja pod modele lokalne (zastosowana)
1. **Twarde tool-use**: walidacja Zod + fallback parsowania JSON z tekstu.
2. **Małe kroki**: jedno narzędzie na turę.
3. **Kompakcja kontekstu**: auto-kompakcja przy 70% budżetu, LOOKAI.md zachowany.
4. **Determinizm**: temperatura 0.1 (Worker), 0.2 (Mózg).
5. **Fallback dual-model**: Worker domyślnie; Mózg przy planowaniu i eskalacji.

## Bramka weryfikacyjna (smoke test)
- **Scenariusz**: checkout/withRetry — opakowanie fetch w retry z backoffiem + test.
- **Wynik**: model 7B wykonał `read`, `edit` (dodał retry loop), `bash` (test nie przeszedł bo model użył `jest` zamiast `vitest` mocków), kolejne próby `edit` naprawy testu.
- **Status**: pętla agentowa działa end-to-end, narzędzia są wykonywane, routing dual-model działa (widać zmianę modelu w statusie), kompakcja i memory podłączone.
- **Ograniczenie**: model lokalny 7B ma trudności z pisaniem poprawnych testów Vitest (używa Jest). Do poprawy w Fazie 2 przez lepszy prompt systemowy.

## Stan bramek weryfikacyjnych
| Kryterium | Wynik |
|---|---|
| Build | ✅ Czysty |
| Typecheck | ✅ Czysty |
| Testy jednostkowe | ✅ 17/17 zielone |
| Lint | ✅ Czysty (3 warningi `any` w OllamaClient, akceptowalne) |
| Smoke test | ⚠️ Częściowy (read → edit → bash działa; test nie przeszedł przez błąd modelu w mockach) |

## Co NIE zostało zrobione (świadomie odłożone)
- ❌ MCP (klient JSON-RPC 2.0)
- ❌ Realna izolacja sandbox (Docker/WSL2) — egzekucja nadal lokalna
- ❌ Web UI (React + Tailwind)
- ❌ RAG / wektorowa pamięć
- ❌ VS Code extension
- ❌ Orchestrator API + WebSocket
- ❌ Eval harness
- ❌ Pełna obsługa `replace_all` w Edit w bramce (zaimplementowana, ale model jej nie użył)
- ❌ Staleness check w Edit (mtime porównanie) — wymaga rozszerzenia runtime o timestampy
- ❌ Komendy `/context` i `/compact` w TUI (zaimplementowane w PromptAssembler, brak UI bindingu)
- ❌ --continue (wybór sesji z listy) — tylko --resume (ostatnia sesja)
