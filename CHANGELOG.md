# Changelog

## [0.2.5]
- Блок Sonnet скрывается при 0% — появляется только когда накопится реальное использование
- Время до сброса в блоке Sonnet убрано — оно уже показывается в блоке «Неделя»

## [0.2.4]
- **Кружки-индикаторы появляются только при риске** — ниже 60% статус-бар чистый (бар + цифра), 🟡 в диапазоне 60–79%, 🔴 от 80%. Зелёный кружок убран.
- README обновлён под текущий формат, секция Release Notes удалена (история теперь только в CHANGELOG)

## [0.2.3]
- Кружки заменены на 🟡 / 🔴, перенесены вплотную к цифре процента

## [0.2.2]
- Все три индикатора объединены в **один статус-бар-айтем** — другие расширения больше не разрывают группу. Цвет каждого лимита показывается через цветной квадрат рядом с прогресс-баром

## [0.2.1]
- Добавлен **третий индикатор** — недельный лимит только для Sonnet (Max-план). Появляется автоматически, когда API возвращает поле `seven_day_sonnet`

## [0.2.0]
- **Исправлен показ 0%** — убрана логика обнуления при устаревшем `resets_at`; теперь всегда отображается реальное значение из API

## [0.1.8]
- **Исправлен клик-рефреш** — расширение теперь делает HTTP-запрос напрямую (без bash), спиннер виден во время реального ожидания ответа API

## [0.1.7]
- **Клик по индикатору обновляет данные** — тап по статус-бару запускает запрос к API и показывает спиннер во время загрузки

## [0.1.6]
- Version bump to republish with updated release notes

## [0.1.5]
- **Auto-setup on install** — extension automatically creates `~/.claude/hooks/save-limits.sh` and registers the Stop hook in `~/.claude/settings.json`; no manual configuration needed
- **No `jq` dependency** — hook script rewritten to use only Node.js (works on Windows, macOS, Linux)

## [0.1.4]
- Switched to `icon.png`
- Version bump

## [0.1.3]
- Auto-reset: usage drops to 0% when `resets_at` timestamp is in the past
- Added 60-second periodic refresh timer (status updates even when file is unchanged)

## [0.1.2]
- Split status bar into two separate items (session / weekly)
- Added reset countdown display

## [0.1.1]
- Added color alerts (green / yellow / red)
- Progress bar visualization

## [0.1.0]
- Initial release
