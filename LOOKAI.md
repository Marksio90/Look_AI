# LookAI — Faza 0 (Zakończona)

## Cel fazy
Minimalna, działająca pętla agentowa: monorepo + gateway LLM (Ollama) + narzędzia (Read/Write/Edit/Bash) + AgentRuntime + CLI REPL.

## Co dostarczono

### 1. Szkielet monorepo (pnpm workspaces)
- `packages/shared`, `packages/llm`, `packages/tools`, `packages/core`
- `apps/cli`
- TypeScript strict, vitest, eslint (typescript-eslint), root skrypty `build/test/lint/typecheck/clean`.

### 2. packages/llm — gateway LLM
- `LLMClient` (interfejs) + `OllamaClient` (adapter OpenAI-compatible, domyślnie `http://localhost:11434/v1`).
- Znormalizowana odpowiedź: `{ stopReason, text, toolCalls[], usage }`.
- Na razie WSZYSTKO routowane do Workera (`qwen2.5-coder:7b`), temperatura 0.1.
- Tryb `response_format: { type: "json_object" }` dostępny dla tur narzędziowych.

### 3. packages/tools — minimalny zestaw
- `Read` — czyta plik z numerami linii, paginacja (max 200 linii), oznacza plik jako "przeczytany".
- `Write` — tworzy/nadpisuje plik.
- `Edit` — str-replace (`old_str` → `new_str`). WYMAGA wcześniejszego `Read` (egzekwowane przez runtime).
- `Bash` — `child_process` w trwałej sesji (`cwd` i `env` utrzymują się między komendami).
- `ToolRegistry` — rejestracja + dispatch po nazwie z walidacją Zod.

### 4. packages/core — AgentRuntime (serce, małe)
- Stan = tablica `Message[]` (bez maszyny stanów, bez grafu workflow).
- Pętla: `llm.create()` → routing po `stopReason`:
  - `tool_use` → wykonaj narzędzie, dołącz `tool_result`, wróć do pętli.
  - `end_turn` → zakończ.
  - `max_tokens` / `error` → zakończ z błędem.
- `UsageTracker` (tokeny, liczba tur).
- `maxTurns` (domyślnie 25) — guard.
- **Fallback parsowania JSON z tekstu** — dla lokalnych modeli, które nie emitują natywnych `tool_calls` (np. Qwen 3B/7B w Ollama), runtime wyciąga JSON z bloku markdown i traktuje go jako wywołanie narzędzia.

### 5. apps/cli — prosty REPL
- Czyta prompt ze `stdin`, woła `AgentRuntime`, streamuje tekst, wypisuje wywołania narzędzi i wyniki w czytelnej formie.
- Jeden prompt = jedna sesja agentowa. Pusta linia = wyjście.

## Kalibracja pod modele lokalne (zastosowana)
1. **Twarde, strukturalne tool-use**: walidacja Zod każdego wywołania; przy wadliwym JSON re-prompt z błędem (max 2 próby) — w tej fazie fallback parsowania z tekstu kompensuje brak natywnych `tool_calls`.
2. **Mało i małe narzędzia w kontekście**: 4 narzędzia, krótkie opisy.
3. **Małe kroki**: jedno narzędzie na turę (egzekwowane).
4. **Bramki walidacji**: `Read-before-Edit` egzekwowane (Edit bez wcześniejszego Read = błąd).
5. **Dyscyplina kontekstu**: mały kontekst (maxTokens 2048 domyślnie), paginacja Read.
6. **Determinizm**: temperatura 0.1.
7. **Fallback dwóch modeli**: NIE zaimplementowano w tej fazie — na razie tylko Worker.

## Bramka weryfikacyjna (smoke test)
- Utworzono plik `tmp_smoke/calc.ts` z błędem (`a - b` zamiast `a + b`) + test.
- Agent (qwen2.5-coder:3b via Ollama) wykonał:
  1. `read` — odczytał plik.
  2. `edit` — naprawił błąd na `a + b`.
  3. `bash` — uruchomił test (`npx vitest run calc.test.ts`), test przeszedł.
- **Wynik**: pętla działa end-to-end, narzędzia są walidowane, `maxTurns` respektowane.
- **Uwaga**: model 3B po sukcesie wpadł w pętlę `read` → `edit` z nieaktualnym `old_str` (nie zauważył, że zmiana już została wykonana). To znany problem z lokalnymi modelami małymi — do rozwiązania w Fazie 1 przez kompakcję kontekstu / lepszy prompt / samokorektę.

## Stan bramek weryfikacyjnych
| Kryterium | Wynik |
|---|---|
| Build | ✅ Czysty |
| Typecheck | ✅ Czysty |
| Testy jednostkowe | ✅ 14/14 zielone |
| Lint | ✅ Czysty (3 warningi `any` w OllamaClient, akceptowalne) |
| Smoke test end-to-end | ✅ Przeszedł (read → edit → bash/test) |

## Co NIE zostało zrobione (świadomie odłożone)
- ❌ MCP (klient JSON-RPC 2.0)
- ❌ Subagenci
- ❌ Sandbox (Docker/WSL2)
- ❌ Ink/TUI — CLI to prosty REPL
- ❌ Web UI
- ❌ Kompakcja kontekstu / token budgeting
- ❌ SQLite (stan w pamięci + JSONL na dysku dopiero w przyszłej fazie)
- ❌ Routing dual-model (Mózg + Worker) — na razie tylko Worker
- ❌ Pamięć długoterminowa (LOOKAI.md, RAG)
- ❌ Security / permissions / path-guard
- ❌ WebSocket / orchestrator API
- ❌ VS Code extension
- ❌ Eval harness
- ❌ Re-prompt przy wadliwym JSON (max 2 próby) — w tej fazie fallback parsowania z tekstu wystarcza; pełna logika retry w Fazie 1.
