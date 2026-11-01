---
name: ai-limits-0.4.0-release
description: "Состояние релиза 0.4.0 (AI Limits — Claude, Codex, Kimi): Kimi, настройки вида, правило auto, что проверено"
metadata:
  node_type: memory
  type: project
  date: 2026-11-01
---

# AI Limits 0.4.0 — состояние на 2026-11-01

Спека: `docs/superpowers/specs/2026-11-01-ai-limits-0.4.0-design.md`, план: `docs/superpowers/plans/2026-11-01-ai-limits-0.4.0.md`.

## Статус

- Собран `claude-limits-0.4.0.vsix` (10 файлов), 78/78 тестов, проверен вживую пользователем: три индикатора, значки, подсказки с аккаунтами, обновление по клику.
- Не запушено и не опубликовано. Публикует пользователь сам; не считать опубликованным без его подтверждения.
- 0.3.5 так и не выпускалась — исправления Codex из 0.3.4 вошли в 0.4.0 (handoff 2026-10-26 закрыт).

## Что нового

- Имя `AI Limits — Claude, Codex, Kimi`, новая иконка 1024px от пользователя (бейдж «AI LIMITS», без логотипа VS Code). ID `maslovserg.claude-limits` и ключи `claudeLimits.*` не менялись.
- Карточка в списке расширений VS Code берётся из Marketplace, а не из VSIX — старое имя там до публикации, это норма.
- Kimi: `GET https://api.kimi.com/coding/v1/usages` (окна `limit_5h`, `limit_7d`, `limit_month_total`, доля `used_ratio`) и `GET .../coding/v1/me` (`nickname`, `email`) с токеном из `~/.kimi-code/credentials/kimi-code.json`. Найдено в бинарнике `~/.kimi-code/bin/kimi.exe` (`fetchManagedUsage`, `fetchManagedUserInfo`). Только чтение: токен живёт 15 минут, продлевает его только открытый Kimi Code. При протухшем токене — последние цифры и аккаунт из `globalState` (`kimiUsage`, `kimiAccount`).
- Настройки вида: `showProgressBars`, `labels` (words/letters), `showServiceNames`, `shortWindowLabel` (session/5h, по умолчанию session — пять часов это скользящий лимит, не сессия). Sonnet — `Sn` только в EN + letters + session.
- `auto` для Codex и Kimi = есть файл входа; установленное расширение без входа не показывает индикатор.
- Приоритеты индикаторов 101 / 100.99 / 100.98 — выше общего 100 (Live Server «Go Live» вставал между ними).
- Codex app-server в `account/read` отдаёт только `type`, `email`, `planType` — имя берём из `id_token` в `~/.codex/auth.json` первым.

## Грабли

- Нельзя вызывать `refresh()` синхронно в ветке ручного обновления: VS Code шлёт обновления Status Bar пачкой, и мгновенная перерисовка стирает крутилку у всех индикаторов. Ветка Kimi без запроса только обновляет подсказку. Тот же эффект остался у Claude без входа (было и до 0.4.0).
- После `code --install-extension` поверх той же версии нужно Reload Window, иначе значки/код в окне старые.
- vitest при `cd c:/...` (строчная буква диска) пишет «no tests» — запускать из `C:/Projects/...`.
