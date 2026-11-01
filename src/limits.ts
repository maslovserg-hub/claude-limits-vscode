export interface LimitsData {
  fiveHour: number;
  sevenDay: number;
  sevenDaySonnet?: number;
  fiveHourResetsAt?: string;
  sevenDayResetsAt?: string;
  sevenDaySonnetResetsAt?: string;
}

export interface CodexLimitWindow {
  usedPercent: number;
  windowMinutes: number;
  resetsAt?: string;
  label?: string;
}

export interface CodexLimitsData {
  primary?: CodexLimitWindow;
  secondary?: CodexLimitWindow;
  individual?: CodexLimitWindow;
  planType?: string;
}

export interface KimiLimitWindow {
  usedPercent: number;
  resetsAt?: string;
}

export interface KimiLimitsData {
  fiveHour?: KimiLimitWindow;
  sevenDay?: KimiLimitWindow;
  month?: KimiLimitWindow;
}

export type VisibilityMode = 'auto' | 'always' | 'hidden';

export function shouldShowService(mode: VisibilityMode, connected: boolean): boolean {
  if (mode === 'hidden') return false;
  if (mode === 'always') return true;
  return connected;
}

const BAR_WIDTH = 6;

export function parseLimits(jsonStr: string): LimitsData | null {
  try {
    const data = JSON.parse(jsonStr);
    let fh = data?.five_hour?.used_percentage;
    let sd = data?.seven_day?.used_percentage;
    if (typeof fh !== 'number' || typeof sd !== 'number') return null;
    const fhResetsAt: string | undefined = data.five_hour?.resets_at;
    const sdResetsAt: string | undefined = data.seven_day?.resets_at;
    const sdsPct = data?.seven_day_sonnet?.used_percentage;
    const sdsResetsAt: string | undefined = data?.seven_day_sonnet?.resets_at;
    const now = Date.now();
    return {
      fiveHour: fh,
      sevenDay: sd,
      sevenDaySonnet: typeof sdsPct === 'number' && sdsPct > 0 ? sdsPct : undefined,
      fiveHourResetsAt: fhResetsAt && new Date(fhResetsAt).getTime() > now ? fhResetsAt : undefined,
      sevenDayResetsAt: sdResetsAt && new Date(sdResetsAt).getTime() > now ? sdResetsAt : undefined,
      sevenDaySonnetResetsAt: sdsResetsAt && new Date(sdsResetsAt).getTime() > now ? sdsResetsAt : undefined,
    };
  } catch {
    return null;
  }
}

export function formatProgressBar(pct: number): string {
  const filled = Math.round((pct / 100) * BAR_WIDTH);
  return '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);
}

export function getColor(pct: number): 'green' | 'yellow' | 'red' {
  if (pct >= 80) return 'red';
  if (pct >= 50) return 'yellow';
  return 'green';
}

export function getStatusEmoji(pct: number): string {
  if (pct >= 80) return '🔴';
  if (pct >= 60) return '🟡';
  return '';
}

export function formatTimeRemaining(resetsAt: string): string {
  const diff = new Date(resetsAt).getTime() - Date.now();
  if (diff <= 0) return '';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}м`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}ч`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}д${remHours}ч` : `${days}д`;
}

export type Lang = 'ru' | 'en';
export type LabelStyle = 'words' | 'letters';
export type ShortWindowLabel = 'session' | '5h';
export type WindowKind = 'session' | 'week' | 'month';

export interface ViewOptions {
  labels?: LabelStyle;
  showServiceNames?: boolean;
  shortWindowLabel?: ShortWindowLabel;
}

const LABELS: Record<Lang, Record<WindowKind, string>> = {
  ru: { session: 'Сессия', week: 'Неделя', month: 'Месяц' },
  en: { session: 'Session', week: 'Week', month: 'Month' },
};

const LETTERS: Record<Lang, Record<WindowKind, string>> = {
  ru: { session: 'С', week: 'Н', month: 'М' },
  en: { session: 'S', week: 'W', month: 'M' },
};

const FIVE_HOURS: Record<Lang, string> = { ru: '5ч', en: '5h' };

export function getWindowLabel(kind: WindowKind, lang: Lang, view: ViewOptions = {}): string {
  if (kind === 'session' && view.shortWindowLabel === '5h') return FIVE_HOURS[lang];
  return (view.labels === 'letters' ? LETTERS : LABELS)[lang][kind];
}

// «S» у Sonnet совпадает с сессией только в английских буквах — там Sonnet становится «Sn».
function getSonnetLabel(lang: Lang, view: ViewOptions): string {
  return lang === 'en' && view.labels === 'letters' && view.shortWindowLabel !== '5h' ? 'Sn' : 'S';
}

export function withServiceName(name: string, text: string, view: ViewOptions = {}): string {
  return view.showServiceNames === false ? text : `${name}: ${text}`;
}

function formatWindowText(label: string, pct: number, resetsAt: string | undefined, showProgressBars: boolean): string {
  const bar = showProgressBars ? formatProgressBar(pct) + ' ' : '';
  const time = resetsAt ? ` (~${formatTimeRemaining(resetsAt)})` : '';
  return `${label}: ${bar}${getStatusEmoji(pct)}${pct}%${time}`;
}

export function formatFiveHourText(limits: LimitsData, lang: Lang = 'en', showProgressBars = true, view: ViewOptions = {}): string {
  return formatWindowText(getWindowLabel('session', lang, view), limits.fiveHour, limits.fiveHourResetsAt, showProgressBars);
}

export function formatSevenDayText(limits: LimitsData, lang: Lang = 'en', showProgressBars = true, view: ViewOptions = {}): string {
  return formatWindowText(getWindowLabel('week', lang, view), limits.sevenDay, limits.sevenDayResetsAt, showProgressBars);
}

export function formatSevenDaySonnetText(limits: LimitsData, lang: Lang = 'en', view: ViewOptions = {}): string | null {
  if (typeof limits.sevenDaySonnet !== 'number') return null;
  const emoji = getStatusEmoji(limits.sevenDaySonnet);
  return `${getSonnetLabel(lang, view)}: ${emoji}${limits.sevenDaySonnet}%`;
}

export function formatStatusText(limits: LimitsData, lang: Lang = 'en', showProgressBars = true, view: ViewOptions = {}): string {
  const blocks = [
    formatFiveHourText(limits, lang, showProgressBars, view),
    formatSevenDayText(limits, lang, showProgressBars, view),
    formatSevenDaySonnetText(limits, lang, view),
  ].filter((block): block is string => Boolean(block));
  return withServiceName('Claude', blocks.join(' | '), view);
}

function parseCodexReset(value: unknown): string | undefined {
  if (typeof value === 'number') return new Date(value * 1000).toISOString();
  if (typeof value === 'string') return value;
  return undefined;
}

function parseCodexWindow(data: unknown, label?: string): CodexLimitWindow | undefined {
  const window = data as {
    used_percent?: unknown;
    usedPercent?: unknown;
    window_minutes?: unknown;
    windowDurationMins?: unknown;
    limit_window_seconds?: unknown;
    resets_at?: unknown;
    resetsAt?: unknown;
    reset_at?: unknown;
  } | null;
  const windowMinutes = typeof window?.window_minutes === 'number'
    ? window.window_minutes
    : typeof window?.windowDurationMins === 'number'
      ? window.windowDurationMins
    : typeof window?.limit_window_seconds === 'number'
      ? Math.round(window.limit_window_seconds / 60)
      : undefined;
  const usedPercent = typeof window?.used_percent === 'number'
    ? window.used_percent
    : typeof window?.usedPercent === 'number'
      ? window.usedPercent
      : undefined;
  if (typeof usedPercent !== 'number' || typeof windowMinutes !== 'number') return undefined;
  const resetsAt = parseCodexReset(window?.resets_at ?? window?.reset_at ?? window?.resetsAt);
  return {
    usedPercent: Math.round(usedPercent),
    windowMinutes,
    resetsAt: resetsAt && new Date(resetsAt).getTime() > Date.now() ? resetsAt : undefined,
    label,
  };
}

export function parseCodexLimitsFromJsonLine(line: string): CodexLimitsData | null {
  try {
    const data = JSON.parse(line);
    const rateLimits = data?.payload?.rate_limits;
    if (!rateLimits) return null;
    const primary = parseCodexWindow(rateLimits.primary);
    const secondary = parseCodexWindow(rateLimits.secondary);
    const individual = parseCodexWindow(rateLimits.individual_limit, 'I');
    if (!primary && !secondary && !individual) return null;
    return {
      primary,
      secondary,
      individual,
      planType: typeof rateLimits.plan_type === 'string' ? rateLimits.plan_type : undefined,
    };
  } catch {
    return null;
  }
}

export function parseCodexLimitsFromSessionLog(content: string): CodexLimitsData | null {
  let latest: CodexLimitsData | null = null;
  for (const line of content.split(/\r?\n/)) {
    if (!line.includes('"rate_limits"')) continue;
    const limits = parseCodexLimitsFromJsonLine(line);
    if (limits) latest = limits;
  }
  return latest;
}

export function parseCodexLimitsFromWhamUsage(jsonStr: string): CodexLimitsData | null {
  try {
    const data = JSON.parse(jsonStr);
    const rateLimit = data?.rate_limit ?? data?.rateLimit;
    if (!rateLimit) return null;
    const primary = parseCodexWindow(rateLimit.primary_window ?? rateLimit.primaryWindow);
    const secondary = parseCodexWindow(rateLimit.secondary_window ?? rateLimit.secondaryWindow);
    const individual = parseCodexWindow(rateLimit.individual_limit ?? rateLimit.individualLimit, 'I');
    if (!primary && !secondary && !individual) return null;
    return {
      primary,
      secondary,
      individual,
      planType: typeof data?.plan_type === 'string' ? data.plan_type : undefined,
    };
  } catch {
    return null;
  }
}

export function parseCodexLimitsFromAppServerRateLimits(rateLimits: unknown): CodexLimitsData | null {
  const data = rateLimits as { primary?: unknown; secondary?: unknown; individualLimit?: unknown; planType?: unknown } | null;
  const primary = parseCodexWindow(data?.primary);
  const secondary = parseCodexWindow(data?.secondary);
  const individual = parseCodexWindow(data?.individualLimit, 'I');
  if (!primary && !secondary && !individual) return null;
  return {
    primary,
    secondary,
    individual,
    planType: typeof data?.planType === 'string' ? data.planType : undefined,
  };
}

function getCodexWindowLabel(windowMinutes: number, lang: Lang, view: ViewOptions): string {
  if (windowMinutes >= 10080) return getWindowLabel('week', lang, view);
  if (windowMinutes <= 300) return getWindowLabel('session', lang, view);
  const hours = Math.round(windowMinutes / 60);
  return hours >= 1 ? `${hours}h` : `${windowMinutes}m`;
}

export function formatCodexWindowText(window: CodexLimitWindow, lang: Lang = 'en', showProgressBars = true, view: ViewOptions = {}): string {
  if (window.label) {
    const emoji = getStatusEmoji(window.usedPercent);
    return `${window.label}: ${emoji}${window.usedPercent}%`;
  }
  return formatWindowText(getCodexWindowLabel(window.windowMinutes, lang, view), window.usedPercent, window.resetsAt, showProgressBars);
}

export function formatCodexStatusText(limits: CodexLimitsData, lang: Lang = 'en', showProgressBars = true, view: ViewOptions = {}): string {
  const blocks = [limits.secondary, limits.primary, limits.individual]
    .filter((window): window is CodexLimitWindow => Boolean(window))
    .sort((a, b) => a.windowMinutes - b.windowMinutes)
    .map(window => formatCodexWindowText(window, lang, showProgressBars, view));
  return blocks.length > 0 ? withServiceName('Codex', blocks.join(' | '), view) : 'Codex Limits: N/A';
}

function parseKimiWindow(raw: unknown): KimiLimitWindow | undefined {
  const entry = raw as { used_ratio?: unknown; reset_time?: unknown } | null;
  const value = entry?.used_ratio;
  const ratio = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(ratio)) return undefined;
  const window: KimiLimitWindow = { usedPercent: Math.round(ratio * 100) };
  if (typeof entry?.reset_time === 'string' && entry.reset_time) window.resetsAt = entry.reset_time;
  return window;
}

// Ответ GET https://api.kimi.com/coding/v1/usages — тот же, что читает /usage в Kimi Code.
export function parseKimiUsage(jsonStr: string): KimiLimitsData | null {
  try {
    const usages = JSON.parse(jsonStr)?.usages;
    const limits: KimiLimitsData = {};
    const fiveHour = parseKimiWindow(usages?.limit_5h);
    const sevenDay = parseKimiWindow(usages?.limit_7d);
    const month = parseKimiWindow(usages?.limit_month_total);
    if (fiveHour) limits.fiveHour = fiveHour;
    if (sevenDay) limits.sevenDay = sevenDay;
    if (month) limits.month = month;
    return fiveHour || sevenDay || month ? limits : null;
  } catch {
    return null;
  }
}

export function formatKimiStatusText(limits: KimiLimitsData, lang: Lang = 'en', showProgressBars = true, view: ViewOptions = {}): string {
  const windows: [WindowKind, KimiLimitWindow | undefined][] = [
    ['session', limits.fiveHour],
    ['week', limits.sevenDay],
    ['month', limits.month],
  ];
  const blocks = windows
    .filter((entry): entry is [WindowKind, KimiLimitWindow] => Boolean(entry[1]))
    .map(([kind, window]) => {
      // Kimi может быть закрыт часами, а цифры — из кеша: окно, чей сброс уже прошёл, пустое.
      const expired = window.resetsAt !== undefined && new Date(window.resetsAt).getTime() <= Date.now();
      return formatWindowText(getWindowLabel(kind, lang, view), expired ? 0 : window.usedPercent, expired ? undefined : window.resetsAt, showProgressBars);
    });
  return withServiceName('Kimi', blocks.join(' | '), view);
}

// Профиль из GET https://api.kimi.com/coding/v1/me — тот же, что читает Kimi Code.
export function parseKimiAccountLabel(jsonStr: string): string {
  try {
    const me = JSON.parse(jsonStr);
    const email = typeof me?.email === 'string' ? me.email : '';
    const name = typeof me?.nickname === 'string' ? me.nickname : '';
    return name && email ? `${name} (${email})` : email || name;
  } catch {
    return '';
  }
}

// Codex-аккаунт: app-server может вернуть account: null, тогда имя и почту берём из id_token в ~/.codex/auth.json.
export function parseCodexAccountLabel(idToken: unknown): string {
  if (typeof idToken !== 'string') return '';
  const payload = idToken.split('.')[1];
  if (!payload) return '';
  try {
    const claims = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    const email = typeof claims?.email === 'string' ? claims.email : '';
    const name = typeof claims?.name === 'string' ? claims.name : '';
    return name && email ? `${name} (${email})` : email || name;
  } catch {
    return '';
  }
}
