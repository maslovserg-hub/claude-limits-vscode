# Changelog

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
