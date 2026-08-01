import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import { parseLimits, formatStatusText, parseCodexLimitsFromSessionLog, parseCodexLimitsFromWhamUsage, parseCodexLimitsFromAppServerRateLimits, parseCodexAccountLabel, formatCodexStatusText, shouldShowService, CodexLimitsData, VisibilityMode, Lang } from './limits';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const LIMITS_FILE = path.join(CLAUDE_DIR, 'limits.json');
const HOOKS_DIR = path.join(CLAUDE_DIR, 'hooks');
const HOOK_SCRIPT = path.join(HOOKS_DIR, 'save-limits.sh');
const CLAUDE_SETTINGS = path.join(CLAUDE_DIR, 'settings.json');
const CREDS_FILE = path.join(CLAUDE_DIR, '.credentials.json');
const CODEX_SESSIONS_DIR = path.join(os.homedir(), '.codex', 'sessions');
// Пять минут вместо минуты: эндпоинт лимитов не публичный и при частых запросах отвечает 429.
const REFRESH_INTERVAL_MS = 300_000;

function findLatestCodexSessionFiles(dir: string, limit = 20): string[] {
  const files: { file: string; mtimeMs: number }[] = [];

  function walk(current: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        try {
          files.push({ file: fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs });
        } catch {}
      }
    }
  }

  walk(dir);
  return files
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit)
    .map(item => item.file);
}

function readLatestCodexLimits() {
  for (const file of findLatestCodexSessionFiles(CODEX_SESSIONS_DIR)) {
    try {
      const limits = parseCodexLimitsFromSessionLog(fs.readFileSync(file, 'utf8'));
      if (limits) return limits;
    } catch {}
  }
  return null;
}

function fetchCodexLimits(onAccountLabel: (label: string) => void): Promise<CodexLimitsData | null> {
  return fetchCodexLimitsFromAppServer(onAccountLabel);
}

// Запасной источник аккаунта: app-server стал отвечать account: null, но логин лежит в ~/.codex/auth.json.
function readCodexAccountLabel(): string {
  try {
    const auth = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.codex', 'auth.json'), 'utf8'));
    return parseCodexAccountLabel(auth?.tokens?.id_token);
  } catch {
    return '';
  }
}

function findCodexExecutable(): string | null {
  const desktopBin = path.join(os.homedir(), 'AppData', 'Local', 'OpenAI', 'Codex', 'bin');
  try {
    const versions = fs.readdirSync(desktopBin, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(desktopBin, entry.name, 'codex.exe'))
      .filter(file => fs.existsSync(file));
    if (versions.length > 0) return versions[versions.length - 1];
  } catch {}
  return process.platform === 'win32' ? 'codex.cmd' : 'codex';
}

function fetchCodexLimitsFromAppServer(onAccountLabel: (label: string) => void): Promise<CodexLimitsData | null> {
  return new Promise(resolve => {
    const executable = findCodexExecutable();
    if (!executable) {
      resolve(null);
      return;
    }

    let settled = false;
    let buffer = '';
    const child = spawn(executable, ['app-server'], {
      env: { ...process.env, CODEX_HOME: path.join(os.homedir(), '.codex') },
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
    });

    function finish(limits: CodexLimitsData | null): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.kill(); } catch {}
      resolve(limits);
    }

    function send(message: unknown): void {
      try {
        child.stdin.write(JSON.stringify(message) + '\n');
      } catch {
        finish(null);
      }
    }

    const timer = setTimeout(() => finish(null), 10_000);

    child.on('error', () => finish(null));
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf('\n');
        if (!line) continue;
        try {
          const message = JSON.parse(line);
          if (message.id === 1) {
            send({ method: 'initialized', params: {} });
            send({ method: 'account/read', id: 2, params: { refreshToken: true } });
          } else if (message.id === 2) {
            const account = message.result?.account ?? message.result;
            const email = typeof account?.email === 'string' ? account.email : '';
            const name = typeof account?.displayName === 'string'
              ? account.displayName
              : typeof account?.name === 'string'
                ? account.name
                : '';
            onAccountLabel(name && email ? `${name} (${email})` : email || name);
            send({ method: 'account/rateLimits/read', id: 3 });
          } else if (message.id === 3) {
            finish(parseCodexLimitsFromAppServerRateLimits(message.result?.rateLimits));
          }
        } catch {}
      }
    });

    send({
      method: 'initialize',
      id: 1,
      params: {
        clientInfo: { name: 'claude-limits-vscode', title: 'Claude Limits VS Code', version: '0.3.3' },
      },
    });
  });
}

// Запросы к api.anthropic.com идут через curl: обращения из node блокирует Cloudflare (403 "Request not allowed").
function curlGet(urlPath: string, token: string): Promise<{ status: number; body: string }> {
  return new Promise(resolve => {
    let settled = false;
    let out = '';
    function finish(status: number, body: string): void {
      if (settled) return;
      settled = true;
      resolve({ status, body });
    }
    try {
      const child = spawn('curl', [
        '-s', '--max-time', '10',
        '-w', '\n%{http_code}',
        '-H', `Authorization: Bearer ${token}`,
        '-H', 'anthropic-beta: oauth-2025-04-20',
        `https://api.anthropic.com${urlPath}`,
      ], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      child.stdout.on('data', (c: Buffer) => { out += c.toString(); });
      child.on('error', () => finish(0, ''));
      child.on('close', () => {
        const cut = out.lastIndexOf('\n');
        if (cut < 0) { finish(0, ''); return; }
        finish(Number(out.slice(cut + 1).trim()) || 0, out.slice(0, cut));
      });
    } catch { finish(0, ''); }
  });
}

function readToken(): string {
  try {
    const creds = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
    const token = creds?.claudeAiOauth?.accessToken;
    return typeof token === 'string' ? token : '';
  } catch {
    return '';
  }
}

function fetchAccountLabel(): Promise<string> {
  const token = readToken();
  if (!token) return Promise.resolve('');
  return curlGet('/api/oauth/profile', token).then(({ status, body }) => {
    if (status !== 200) return '';
    try {
      const acc = JSON.parse(body)?.account;
      if (!acc) return '';
      return (acc.display_name ? `${acc.display_name} (${acc.email})` : acc.email) || '';
    } catch { return ''; }
  });
}

const HOOK_CONTENT = `#!/usr/bin/env bash
# Claude Limits Monitor: fetches rate limits after each response
# Запрос делает curl: обращения из node к api.anthropic.com блокирует Cloudflare (403 "Request not allowed").
CREDS="$HOME/.claude/.credentials.json"
LIMITS="$HOME/.claude/limits.json"
[ -f "$CREDS" ] || exit 0
# Хук срабатывает после каждого ответа: если лимиты обновлялись меньше минуты назад, запрос не нужен.
if [ -f "$LIMITS" ] && [ -z "$(find "$LIMITS" -mmin +1 2>/dev/null)" ]; then exit 0; fi
TOKEN=$(node -e "try{const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(c.claudeAiOauth?.accessToken||'')}catch(e){}" "$CREDS")
[ -n "$TOKEN" ] || exit 0

curl -s --max-time 10 \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "anthropic-beta: oauth-2025-04-20" \\
  https://api.anthropic.com/api/oauth/usage | node -e "
const fs = require('fs');
const os = require('os');
const path = require('path');

let data = '';
process.stdin.on('data', c => data += c);
process.stdin.on('end', () => {
  try {
    const d = JSON.parse(data);
    if (d.error) return;
    if (typeof d.five_hour?.utilization !== 'number' || typeof d.seven_day?.utilization !== 'number') return;
    const out = {
      five_hour: { used_percentage: d.five_hour.utilization, resets_at: d.five_hour.resets_at || null },
      seven_day: { used_percentage: d.seven_day.utilization, resets_at: d.seven_day.resets_at || null }
    };
    if (typeof d.seven_day_sonnet?.utilization === 'number') {
      out.seven_day_sonnet = { used_percentage: d.seven_day_sonnet.utilization, resets_at: d.seven_day_sonnet.resets_at || null };
    }
    fs.writeFileSync(path.join(os.homedir(), '.claude', 'limits.json'), JSON.stringify(out));
  } catch(e) {}
});
"
`;

function ensureHookSetup(): boolean {
  try {
    fs.mkdirSync(HOOKS_DIR, { recursive: true });
    let currentHook = '';
    try { currentHook = fs.readFileSync(HOOK_SCRIPT, 'utf8'); } catch {}
    if (currentHook !== HOOK_CONTENT) {
      fs.writeFileSync(HOOK_SCRIPT, HOOK_CONTENT, { mode: 0o755 });
    }

    let settings: Record<string, unknown> = {};
    try { settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, 'utf8')); } catch {}

    const hookCmd = `bash "${HOOK_SCRIPT.replace(/\\/g, '/')}"`;

    const stopGroups: unknown[] = (settings.hooks as Record<string, unknown>)?.Stop as unknown[] ?? [];
    const alreadySet = stopGroups.some((g: unknown) =>
      (g as { hooks?: { command?: string }[] })?.hooks?.some(h => h?.command?.includes('save-limits.sh'))
    );
    if (alreadySet) return false;

    if (!settings.hooks) { settings.hooks = {}; }
    const hooks = settings.hooks as Record<string, unknown[]>;
    if (!hooks.Stop) { hooks.Stop = []; }
    hooks.Stop.push({ matcher: '', hooks: [{ type: 'command', command: hookCmd }] });

    fs.writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2));
    return true;
  } catch {
    return false;
  }
}

export function activate(context: vscode.ExtensionContext) {
  ensureHookSetup();

  if (!context.globalState.get('languageHintShown')) {
    context.globalState.update('languageHintShown', true);
    vscode.window.showInformationMessage(
      'Claude Limits: status bar is in English by default. Switch to Russian in Settings → claudeLimits.language = ru',
      'Open Settings'
    ).then(choice => {
      if (choice === 'Open Settings') {
        vscode.commands.executeCommand('workbench.action.openSettings', '@ext:maslovserg.claude-limits');
      }
    });
  }

  const claudeItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
  const codexItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  claudeItem.command = 'claudeLimits.refresh';
  codexItem.command = 'claudeLimits.refresh';
  context.subscriptions.push(claudeItem, codexItem);

  const STRINGS: Record<Lang, { tooltip: string; updating: string; codexTooltip: string; staleData: string; noData: string }> = {
    ru: {
      tooltip: 'Claude Limits — клик для обновления',
      updating: '$(sync~spin) Claude Limits: обновление...',
      codexTooltip: 'Codex Limit: клик для обновления',
      staleData: 'Не удалось обновить лимиты — показаны последние известные данные',
      noData: 'Не удалось получить лимиты',
    },
    en: {
      tooltip: 'Claude Limits — click to refresh',
      updating: '$(sync~spin) Claude Limits: updating...',
      codexTooltip: 'Codex Limit: click to refresh',
      staleData: 'Could not refresh limits — showing last known data',
      noData: 'Could not fetch limits',
    },
  };

  let cachedAccountLabel = '';
  let cachedCodexAccountLabel = '';
  let cachedCodexLimits: CodexLimitsData | null = null;
  let codexConnected = false;
  let claudeFetchError = '';
  let dataIsStale = false;

  function dataAgeMs(): number {
    try {
      return Date.now() - fs.statSync(LIMITS_FILE).mtimeMs;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  }

  // Лимиты считаются несвежими, если файл не обновлялся дольше двух интервалов опроса.
  function isDataStale(): boolean {
    return dataAgeMs() > 2 * REFRESH_INTERVAL_MS;
  }

  function applyTooltips(lang: Lang): void {
    const claudeLines = [STRINGS[lang].tooltip];
    if (cachedAccountLabel) claudeLines.push(cachedAccountLabel);
    if (dataIsStale) {
      claudeLines.push(claudeFetchError
        ? `⚠ ${STRINGS[lang].staleData} (${claudeFetchError})`
        : `⚠ ${STRINGS[lang].staleData}`);
    }
    claudeItem.tooltip = claudeLines.join('\n');
    codexItem.tooltip = cachedCodexAccountLabel
      ? `${STRINGS[lang].codexTooltip}\n${cachedCodexAccountLabel}`
      : STRINGS[lang].codexTooltip;
  }

  function getLang(): Lang {
    return vscode.workspace.getConfiguration('claudeLimits').get<Lang>('language', 'en');
  }

  function getVisibility(key: 'claudeVisibility' | 'codexVisibility'): VisibilityMode {
    return vscode.workspace.getConfiguration('claudeLimits').get<VisibilityMode>(key, 'auto');
  }

  function isClaudeConnected(): boolean {
    try {
      const creds = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
      return typeof creds?.claudeAiOauth?.accessToken === 'string' && creds.claudeAiOauth.accessToken.length > 0;
    } catch {
      return false;
    }
  }

  function refresh() {
    const lang = getLang();
    // Данные пишут двое: сам опрос и Stop-хук. Поэтому «несвежесть» определяется возрастом файла,
    // а не судьбой последнего запроса: пока хук обновляет лимиты, неудачный опрос не повод пугать.
    dataIsStale = isDataStale();
    applyTooltips(lang);
    let claudeText: string;
    try {
      const content = fs.readFileSync(LIMITS_FILE, 'utf8');
      const limits = parseLimits(content);
      if (limits) {
        claudeText = dataIsStale
          ? `$(warning) ${formatStatusText(limits, lang)}`
          : formatStatusText(limits, lang);
      } else {
        claudeText = 'Claude: N/A';
      }
    } catch {
      claudeText = `$(warning) Claude: ${STRINGS[lang].noData}`;
    }

    const codexLimits = cachedCodexLimits ?? readLatestCodexLimits();
    const codexText = codexLimits ? formatCodexStatusText(codexLimits, lang) : 'Codex: no data';
    claudeItem.text = claudeText;
    codexItem.text = codexText;
    if (shouldShowService(getVisibility('claudeVisibility'), isClaudeConnected())) {
      claudeItem.show();
    } else {
      claudeItem.hide();
    }
    if (shouldShowService(getVisibility('codexVisibility'), codexConnected)) {
      codexItem.show();
    } else {
      codexItem.hide();
    }
  }

  function fetchAndRefresh(manualRefresh = false) {
    if (manualRefresh) {
      claudeItem.text = STRINGS[getLang()].updating;
      codexItem.text = '$(sync~spin) Codex: updating...';
      if (shouldShowService(getVisibility('claudeVisibility'), isClaudeConnected())) claudeItem.show();
      if (shouldShowService(getVisibility('codexVisibility'), codexConnected)) codexItem.show();
    }

    fetchAccountLabel().then(label => {
      cachedAccountLabel = label;
      applyTooltips(getLang());
    });

    fetchCodexLimits(label => {
      cachedCodexAccountLabel = label || readCodexAccountLabel();
      applyTooltips(getLang());
    }).then(limits => {
      if (!cachedCodexAccountLabel) cachedCodexAccountLabel = readCodexAccountLabel();
      cachedCodexLimits = limits;
      codexConnected = Boolean(limits);
      refresh();
    });

    const token = readToken();
    if (!token) { claudeFetchError = 'no credentials'; refresh(); return; }

    // Данные мог только что записать Stop-хук — тогда фоновый опрос не тратит лишний запрос.
    // Клик по индикатору обновляет всегда: пользователь попросил явно.
    if (!manualRefresh && dataAgeMs() < REFRESH_INTERVAL_MS) {
      claudeFetchError = '';
      refresh();
      return;
    }

    curlGet('/api/oauth/usage', token).then(({ status, body }) => {
      if (status !== 200) {
        claudeFetchError = status ? `HTTP ${status}` : 'network error';
        refresh();
        return;
      }
      try {
        const d = JSON.parse(body);
        if (!d.error &&
            typeof d.five_hour?.utilization === 'number' && typeof d.seven_day?.utilization === 'number') {
          const out: Record<string, unknown> = {
            five_hour: { used_percentage: d.five_hour.utilization, resets_at: d.five_hour.resets_at || null },
            seven_day: { used_percentage: d.seven_day.utilization, resets_at: d.seven_day.resets_at || null }
          };
          if (typeof d.seven_day_sonnet?.utilization === 'number') {
            out.seven_day_sonnet = { used_percentage: d.seven_day_sonnet.utilization, resets_at: d.seven_day_sonnet.resets_at || null };
          }
          fs.writeFileSync(LIMITS_FILE, JSON.stringify(out));
          claudeFetchError = '';
        } else {
          claudeFetchError = 'unexpected response';
        }
      } catch {
        claudeFetchError = 'bad response';
      }
      refresh();
    });
  }

  context.subscriptions.push(vscode.commands.registerCommand('claudeLimits.refresh', () => fetchAndRefresh(true)));

  fs.watchFile(LIMITS_FILE, { interval: 1000 }, refresh);
  context.subscriptions.push({ dispose: () => fs.unwatchFile(LIMITS_FILE) });

  const timer = setInterval(fetchAndRefresh, REFRESH_INTERVAL_MS);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
    if (
      e.affectsConfiguration('claudeLimits.language') ||
      e.affectsConfiguration('claudeLimits.claudeVisibility') ||
      e.affectsConfiguration('claudeLimits.codexVisibility')
    ) {
      refresh();
    }
  }));

  fetchAndRefresh();
}

export function deactivate() {}
