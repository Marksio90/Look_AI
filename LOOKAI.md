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
