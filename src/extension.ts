import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseLimits, formatFiveHourText, formatSevenDayText } from './limits';

const LIMITS_FILE = path.join(os.homedir(), '.claude', 'limits.json');
const COLOR_EXCEEDED = '#D4875A';

export function activate(context: vscode.ExtensionContext) {
  const itemFiveHour = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
  itemFiveHour.command = 'claudeLimits.refresh';
  itemFiveHour.tooltip = 'Claude: 5-hour session limit';

  const itemSevenDay = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  itemSevenDay.command = 'claudeLimits.refresh';
  itemSevenDay.tooltip = 'Claude: 7-day weekly limit';

  context.subscriptions.push(itemFiveHour, itemSevenDay);

  function refresh() {
    try {
      const content = fs.readFileSync(LIMITS_FILE, 'utf8');
      const limits = parseLimits(content);
      if (limits) {
        itemFiveHour.text = formatFiveHourText(limits);
        itemFiveHour.color = limits.fiveHour >= 80 ? COLOR_EXCEEDED : undefined;

        itemSevenDay.text = formatSevenDayText(limits);
        itemSevenDay.color = limits.sevenDay >= 80 ? COLOR_EXCEEDED : undefined;
      } else {
        itemFiveHour.text = 'Claude Сессия: N/A';
        itemSevenDay.text = 'Claude Неделя: N/A';
        itemFiveHour.color = undefined;
        itemSevenDay.color = undefined;
      }
    } catch {
      itemFiveHour.text = 'Claude: no data';
      itemSevenDay.text = '';
      itemFiveHour.color = undefined;
      itemSevenDay.color = undefined;
    }
    itemFiveHour.backgroundColor = undefined;
    itemSevenDay.backgroundColor = undefined;
    itemFiveHour.show();
    itemSevenDay.show();
  }

  context.subscriptions.push(vscode.commands.registerCommand('claudeLimits.refresh', refresh));

  fs.watchFile(LIMITS_FILE, { interval: 1000 }, refresh);
  context.subscriptions.push({ dispose: () => fs.unwatchFile(LIMITS_FILE) });

  const timer = setInterval(refresh, 60_000);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });

  refresh();
}

export function deactivate() {}
