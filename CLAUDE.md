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