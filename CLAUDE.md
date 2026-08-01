# ⚠️ ЧЕТЫРЕ ПРИНЦИПА (Karpathy) — соблюдать КАЖДУЮ сессию и КАЖДУЮ итерацию

Эти четыре принципа читаются первыми и обязательны при любой работе с кодом.

1. **Думать до кода** — не додумывать молча: проговаривать допущения, показывать развилки, предлагать способ проще, при неясности остановиться и спросить.
2. **Сначала простота** — минимум кода под задачу: без лишних фич, абстракций и «гибкости», которую не просили. Можно 50 строк вместо 200 — переписать.
3. **Хирургические правки** — трогать только необходимое: не «улучшать» соседнее, не рефакторить рабочее, держаться стиля; убирать только орфанов от своих изменений. Каждая изменённая строка — прямо из запроса.
4. **Выполнение от цели** — задавать проверяемый критерий успеха («почини баг» → «тест, воспроизводящий баг, стал зелёным») и крутить до его выполнения; для многошаговых задач — короткий план «шаг → проверка».

---

# Claude Limits Monitor — VSCode Extension

## Что это

VSCode расширение, которое показывает лимиты Claude Code в Status Bar (внизу).

## Зачем

В VSCode расширении Claude Code нет встроенного statusLine (он работает только в CLI).
Решение: hook в Claude Code пишет лимиты в JSON-файл, расширение читает и показывает в Status Bar.

## Что уже сделано

- `package.json` — манифест расширения (publisher: maslovserg)
- `tsconfig.json` — конфиг TypeScript
- `src/limits.test.ts` — тесты (TDD): parseLimits, formatProgressBar, getColor, formatStatusText

## Что нужно сделать

### 1. Реализация логики (src/limits.ts)
Функции которые покрыты тестами:
- `parseLimits(json)` — парсит JSON с лимитами
- `formatProgressBar(pct)` — 8 символов █░, например `████░░░░`
- `getColor(pct)` — green (<50%), yellow (<80%), red (>=80%)
- `formatStatusText({fiveHour, sevenDay})` — итоговая строка для Status Bar

### 2. Главный файл расширения (src/extension.ts)
- Следит за файлом `~/.claude/limits.json` (fs.watch)
- Обновляет Status Bar после каждого изменения файла
- Команда `claudeLimits.refresh` для ручного обновления

### 3. Hook в Claude Code (~/.claude/settings.json)
Добавить Stop hook, который пишет лимиты в `~/.claude/limits.json`:
```json
{
  "hooks": {
    "Stop": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "bash ~/.claude/hooks/save-limits.sh"
      }]
    }]
  }
}
```

Скрипт `~/.claude/hooks/save-limits.sh` читает stdin (JSON с данными сессии)
и извлекает `rate_limits.five_hour.used_percentage` и `rate_limits.seven_day.used_percentage`.

### 4. Сборка и установка
```bash
npm install
npm test          # проверить что тесты проходят
npm run compile   # собрать
npm run package   # создать .vsix файл
```
Установить: `Extensions → ... → Install from VSIX`

## Формат отображения

```
5h: ████░░░░ 42% | 7d: ██░░░░░░ 18%
```

Цвет Status Bar меняется: зелёный → жёлтый (>50%) → красный (>80%)

## Требования пользователя

- Обновление: после каждого ответа Claude (через Stop hook)
- Распространение: .vsix файл (установка на любой компьютер)
- Publisher: maslovserg

## Рабочий процесс (TDD)

1. Запустить тесты: `npm test`
2. Написать src/limits.ts чтобы тесты прошли
3. Написать src/extension.ts
4. Написать hook-скрипт
5. Собрать и протестировать