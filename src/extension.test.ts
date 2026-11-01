import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';

const state = vi.hoisted(() => ({
  bars: true,
  fail: false,
  limitsDelay: 0,
  requests: [] as any[],
  items: [] as any[],
  changed: undefined as any,
  spawned: [] as string[],
  config: {} as Record<string, unknown>,
  missing: [] as string[],
  kimiExpiresAt: 0,
  kimiStatus: 200,
  refreshCommand: undefined as undefined | (() => void),
  claudeToken: false,
}));
vi.mock('vscode', () => ({
  extensions: { getExtension: () => ({ extensionPath: '/codex-extension' }) },
  StatusBarAlignment: { Right: 1 },
  window: { createStatusBarItem: (_alignment: number, priority: number) => {
    const item = { priority, text: '', tooltip: '', visible: false, show() { this.visible = true; }, hide() { this.visible = false; } };
    state.items.push(item); return item;
  } },
  workspace: {
    getConfiguration: () => ({ get: (key: string, fallback: unknown) =>
      key === 'showProgressBars' ? state.bars : key in state.config ? state.config[key] : fallback }),
    onDidChangeConfiguration: (callback: any) => { state.changed = callback; return { dispose() {} }; },
  },
  commands: { registerCommand: (_id: string, callback: () => void) => { state.refreshCommand = callback; return { dispose() {} }; } },
}));
vi.mock('fs', () => ({
  existsSync: (file: string) => !state.missing.some(name => file.endsWith(name)), mkdirSync() {}, writeFileSync() {}, watchFile() {}, unwatchFile() {},
  readdirSync: () => [], statSync: () => ({ mtimeMs: Date.now() }),
  readFileSync: (file: string) => {
    if (state.missing.some(name => file.endsWith(name))) throw new Error('ENOENT');
    if (file.endsWith('.credentials.json') && state.claudeToken) return JSON.stringify({ claudeAiOauth: { accessToken: 'claude-token' } });
    if (file.endsWith('kimi-code.json')) return JSON.stringify({ access_token: 'kimi-token', expires_at: state.kimiExpiresAt });
    if (file.endsWith('auth.json')) {
      const claims = Buffer.from(JSON.stringify({ name: 'Sergey', email: 'me@example.com' })).toString('base64url');
      return JSON.stringify({ tokens: { id_token: `h.${claims}.s` } });
    }
    if (file.endsWith('limits.json')) return JSON.stringify({ five_hour: { used_percentage: 10 }, seven_day: { used_percentage: 30 } });
    return '{}';
  },
}));
vi.mock('child_process', () => ({ spawn: (executable: string) => {
  state.spawned.push(executable);
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter(); child.stdin = new EventEmitter(); child.kill = () => {};
  child.stdin.write = (line: string) => {
    const request = JSON.parse(line);
    if (!request.id) return;
    state.requests.push(request);
    const respond = () => {
      if (state.fail) { child.emit('error', { code: 'ENOENT' }); return; }
      const result = request.id === 3 ? { rateLimits: { primary: { usedPercent: 18, windowDurationMins: 300 } } }
        : request.id === 2 ? { account: { type: 'chatgpt', email: 'me@example.com', planType: 'plus' } } : {};
      child.stdout.emit('data', Buffer.from(JSON.stringify({ id: request.id, result }) + '\n'));
    };
    if (request.id === 3 && state.limitsDelay) setTimeout(respond, state.limitsDelay);
    else queueMicrotask(respond);
  };
  return child;
} }));
const fetchMock = vi.fn(async (url: string) => ({
  ok: state.kimiStatus === 200,
  status: state.kimiStatus,
  text: async () => url.endsWith('/me')
    ? JSON.stringify({ user_id: 'u1', nickname: 'Sergey', email: 'me@example.com' })
    : JSON.stringify({ usages: { limit_5h: { used_ratio: 0.05 }, limit_month_total: { used_ratio: 0.01 } } }),
}));
vi.stubGlobal('fetch', fetchMock);
import { activate } from './extension';

describe('extension integration', () => {
  beforeEach(() => { vi.useFakeTimers(); state.bars = true; state.fail = false; state.limitsDelay = 0; state.requests = []; state.items = []; state.spawned = [];
    state.config = {}; state.missing = []; state.kimiExpiresAt = Date.now() / 1000 + 900; state.kimiStatus = 200; state.claudeToken = false; fetchMock.mockClear(); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
  async function start() {
    activate({
      globalState: { get: (key: string) => key === 'languageHintShown' ? true : undefined, update: () => Promise.resolve() },
      subscriptions: [],
      extension: { packageJSON: { version: '9.9.9' } },
    } as any);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);
  }
  it('accepts slow limit responses without forcing token refresh or starting duplicate requests', async () => {
    state.limitsDelay = 25000;
    await start();
    await vi.advanceTimersByTimeAsync(25000);
    expect(state.items[1].text).toContain('18%');
    expect(state.requests.filter(request => request.method === 'initialize')).toHaveLength(1);
    expect(state.requests.find(request => request.method === 'account/read').params.refreshToken).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(state.items[1].tooltip).not.toContain('Request timed out');
  });
  it('still times out an unresponsive Codex server', async () => {
    state.limitsDelay = 65000;
    await start();
    await vi.advanceTimersByTimeAsync(60000);
    expect(state.items[1].tooltip).toContain('Request timed out');
    expect(state.requests.filter(request => request.method === 'initialize')).toHaveLength(1);
  });
  it('uses bundled Codex and toggles bars immediately for both services', async () => {
    await start();
    expect(state.spawned[0]).toContain('codex-extension');
    expect(state.items[1].text).toContain('18%');
    expect(state.items[0].text).toMatch(/^\$\(claude-limits-claude\) /);
    expect(state.items[1].text).toMatch(/^\$\(claude-limits-codex\) /);
    expect(state.items[0].text).toMatch(/[█░]/);
    expect(state.items[1].text).toMatch(/[█░]/);
    state.bars = false;
    state.changed({ affectsConfiguration: (key: string) => key === 'claudeLimits.showProgressBars' });
    for (const item of state.items) expect(item.text).not.toMatch(/[█░]/);
    expect(state.items[0].text).toContain('10%');
    expect(state.items[1].text).toContain('18%');
    expect(state.items[0].text).toMatch(/^\$\(claude-limits-claude\) /);
    expect(state.items[1].text).toMatch(/^\$\(claude-limits-codex\) /);
    state.bars = true;
    state.changed({ affectsConfiguration: (key: string) => key === 'claudeLimits.showProgressBars' });
    for (const item of state.items) expect(item.text).toMatch(/[█░]/);
  });
  it('retries a transient startup failure without showing a warning', async () => {
    state.fail = true; await start();
    state.fail = false;
    await vi.advanceTimersByTimeAsync(10000);
    expect(state.items[1].text).toContain('18%');
    await vi.advanceTimersByTimeAsync(20000);
    expect(state.items[1].text).not.toContain('$(warning)');
    expect(state.items[1].tooltip).not.toContain('ENOENT');
  });
  it('delays startup warnings for 30 seconds, then explains persistent failure', async () => {
    state.fail = true; await start();
    expect(state.items[1].text).not.toContain('$(warning)');
    expect(state.items[1].tooltip).not.toContain('ENOENT');
    await vi.advanceTimersByTimeAsync(29999);
    expect(state.items[1].text).not.toContain('$(warning)');
    await vi.advanceTimersByTimeAsync(1);
    expect(state.items[1].visible).toBe(true);
    expect(state.items[1].text).toContain('Could not fetch limits');
    expect(state.items[1].tooltip).toContain('ENOENT');
    expect(state.items[1].text).toMatch(/^\$\(claude-limits-codex\) /);
  });

  it('shows Kimi usage read with its own token', async () => {
    await start();
    const [url, init] = fetchMock.mock.calls[0] as any[];
    expect(url).toBe('https://api.kimi.com/coding/v1/usages');
    expect(init.headers.Authorization).toBe('Bearer kimi-token');
    expect(state.items[2].text).toBe('$(claude-limits-kimi) Kimi: Session: ░░░░░░ 5% | Month: ░░░░░░ 1%');
    expect(state.items[2].visible).toBe(true);
    expect(fetchMock.mock.calls.map(call => call[0])).toContain('https://api.kimi.com/coding/v1/me');
    expect(state.items[2].tooltip).toContain('Sergey (me@example.com)');
  });

  it('keeps the last Kimi numbers when its token expired', async () => {
    await start();
    state.kimiExpiresAt = Date.now() / 1000 - 1;
    await vi.advanceTimersByTimeAsync(300_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(state.items[2].tooltip).toContain('Sergey (me@example.com)');
    expect(state.items[2].text).toContain('5%');
    expect(state.items[2].text).not.toContain('$(warning)');
    expect(state.items[2].tooltip).toContain('token expired');
  });

  it('hides Codex and Kimi without a login even when their extensions are installed', async () => {
    state.missing = ['auth.json', 'kimi-code.json'];
    await start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(state.items[1].visible).toBe(false);
    expect(state.items[2].visible).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('applies compact view settings to every service', async () => {
    state.bars = false;
    state.config = { labels: 'letters', showServiceNames: false, shortWindowLabel: '5h' };
    await start();
    expect(state.items[0].text).toBe('$(claude-limits-claude) 5h: 10% | W: 30%');
    expect(state.items[1].text).toBe('$(claude-limits-codex) 5h: 18%');
    expect(state.items[2].text).toBe('$(claude-limits-kimi) 5h: 5% | M: 1%');
  });

  it('sends the extension version to the Codex app-server', async () => {
    await start();
    expect(state.requests.find(request => request.method === 'initialize').params.clientInfo.version).toBe('9.9.9');
  });

  it('keeps all indicators together above the common priority 100', async () => {
    await start();
    const priorities = state.items.map(item => item.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => b - a));
    for (const priority of priorities) expect(priority).toBeGreaterThan(100);
  });

  it('shows the Codex name from the local token when the app-server returns only an email', async () => {
    await start();
    expect(state.items[1].tooltip).toContain('Sergey (me@example.com)');
  });

  it('refreshes every indicator on click in letters mode', async () => {
    state.config = { labels: 'letters' };
    await start();
    await vi.advanceTimersByTimeAsync(30_000);
    const before = fetchMock.mock.calls.length;
    const spawnedBefore = state.spawned.length;
    state.refreshCommand!();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
    expect(state.spawned.length).toBeGreaterThan(spawnedBefore);
    for (const item of state.items) expect(item.text).not.toContain('$(sync~spin)');
    expect(state.items[0].text).toBe('$(claude-limits-claude) Claude: S: █░░░░░ 10% | W: ██░░░░ 30%');
    expect(state.items[1].text).toBe('$(claude-limits-codex) Codex: S: █░░░░░ 18%');
    expect(state.items[2].text).toBe('$(claude-limits-kimi) Kimi: S: ░░░░░░ 5% | M: ░░░░░░ 1%');
  });

  it('keeps the click spinner while Kimi skips an expired token', async () => {
    state.claudeToken = true;
    state.limitsDelay = 1000;
    state.kimiExpiresAt = Date.now() / 1000 - 1;
    await start();
    await vi.advanceTimersByTimeAsync(30_000);
    state.refreshCommand!();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    for (const item of state.items) expect(item.text).toContain('$(sync~spin)');
  });
});
