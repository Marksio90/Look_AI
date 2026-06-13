# Sufit lokalny LookAI

## Wąskie gardła sprzętowe

| Zasób | Wartość | Wpływ |
|---|---|---|
| VRAM (GPU) | 8 GB (RTX 4070 Laptop) | **Główne ograniczenie** — KV-cache + model Worker |
| RAM (system) | 32 GB | Mózg 30B-A3B + Docker + Node + przeglądarka |
| CPU | i9-13900HX (24 wątki) | Wystarczający, nie jest wąskim gardłem |
| Dysk | SSD NVMe | Wystarczający |

## Modele — zużycie pamięci

| Model | Format | Rozmiar | VRAM | RAM (fallback) |
|---|---|---|---|---|
| Qwen2.5-Coder-7B (Worker) | Q4_K_M | ~4.5 GB | ~5–6 GB rezydentnie | — |
| Qwen3 30B-A3B (Mózg) | Q4_K_M | ~20 GB | nie mieści się | ~24–28 GB RAM |

**Worker** musi być rezydentny na GPU (5–6 GB VRAM). Zostaje ~2–3 GB na KV-cache.
Przy kontekście 4K tokens i batch=1, KV-cache ≈ 0.5–1 GB. Bezpieczny limit kontekstu: **4096 tokens**.

**Mózg** nie mieści się w VRAM — musi być ładowany do RAM (CPU offload przez Ollama).
Przy 32 GB RAM, po odjęciu systemu (~8 GB), Node (~2 GB), Docker (~2 GB), przeglądarka (~4 GB) — zostaje ~16 GB.
Mózg 30B-A3B w Q4_K_M to ~20 GB — **ciasno**. Rozwiązania:
1. Q3_K_M (~15 GB) — mniejsza jakość, ale mieści się.
2. Ładować Mózg tylko na czas planowania, zwalniać po.
3. Zamknąć przeglądarkę / Docker podczas pracy Mózgu.

## Limity kontekstu

| Model | Maks. kontekst | Zalecany | Powód |
|---|---|---|---|
| Worker 7B | 32K | **4K** | KV-cache zżera VRAM; 4K = ~1 GB KV-cache |
| Mózg 30B | 32K | **2K** | CPU offload = wolniejszy; małe kroki = mniej tokenów |

## Przepustowość (przybliżona)

| Scenariusz | Tokens/s | Uwagi |
|---|---|---|
| Worker 7B, 4K ctx, GPU | ~40–60 | Rezydentny, szybki |
| Mózg 30B, 2K ctx, CPU | ~5–15 | CPU offload, wolniejszy |
| Mózg 30B, 2K ctx, GPU (jeśli się zmieści) | ~15–25 | Niestety nie zmieści się w 8 GB |

## Rekomendacje operacyjne

1. **Kontekst mały**: 4K Worker, 2K Mózg. Auto-kompakcja przy 70%.
2. **Jedno narzędzie na turę**: mniej tokenów w output, szybszy turnaround.
3. **Subagenty dla dużych odczytów**: Worker robi Grep/Glob, zwraca podsumowanie.
4. **Mózg na żądanie**: `ollama run` / `ollama stop` w runtime; nie trzymać rezydentnie.
5. **Brak przeglądarki przy Mózgu**: zamknąć web UI / IDE, gdy Mózg pracuje.
6. **Docker tylko gdy sandbox**: nie trzymać kontenerów w tle.
7. **RAG lekki**: SimpleRag (word-frequency) = zero VRAM; nie używać embedding modelu.
8. **Observability lekka**: custom tracer/metrics, nie @opentelemetry/sdk (oszczędza RAM).

## Co NIE zmieści się w tym sprzęcie

- ❌ Dwa modele na GPU jednocześnie (8 GB VRAM)
- ❌ Kontekst 16K+ u Workera (OOM na KV-cache)
- ❌ Embedding model (np. nomic-embed-text) rezydentnie — zżera 1–2 GB VRAM
- ❌ Qdrant / Postgres / Redis rezydentnie — zużywają RAM
- ❌ Grafana + Prometheus serwer — zużywa RAM i CPU
- ❌ Duże batch sizes (>1) — podwaja KV-cache

## Ścieżka eskalacji (gdy OOM)

1. Zmniejsz kontekst (4K → 2K → 1K).
2. Wyładuj Mózg (`ollama stop qwen3:30b-a3b`).
3. Zamknij web UI / IDE / przeglądarkę.
4. Zatrzymaj Docker (jeśli nie używasz sandbox).
5. Przejdź na Worker-only mode (Mózg = planowanie offline).
6. Użyj Q3_K_M zamiast Q4_K_M dla Mózgu.
