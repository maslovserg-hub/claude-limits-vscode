export interface LimitsData {
  fiveHour: number;
  sevenDay: number;
  sevenDaySonnet?: number;
  fiveHourResetsAt?: string;
  sevenDayResetsAt?: string;
  sevenDaySonnetResetsAt?: string;
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

export function formatFiveHourText(limits: LimitsData): string {
  const bar = formatProgressBar(limits.fiveHour);
  const emoji = getStatusEmoji(limits.fiveHour);
  const time = limits.fiveHourResetsAt ? ` (~${formatTimeRemaining(limits.fiveHourResetsAt)})` : '';
  return `Сессия: ${bar} ${emoji}${limits.fiveHour}%${time}`;
}

export function formatSevenDayText(limits: LimitsData): string {
  const bar = formatProgressBar(limits.sevenDay);
  const emoji = getStatusEmoji(limits.sevenDay);
  const time = limits.sevenDayResetsAt ? ` (~${formatTimeRemaining(limits.sevenDayResetsAt)})` : '';
  return `Неделя: ${bar} ${emoji}${limits.sevenDay}%${time}`;
}

export function formatSevenDaySonnetText(limits: LimitsData): string | null {
  if (typeof limits.sevenDaySonnet !== 'number') return null;
  const emoji = getStatusEmoji(limits.sevenDaySonnet);
  return `S: ${emoji}${limits.sevenDaySonnet}%`;
}

export function formatStatusText(limits: LimitsData): string {
  const base = `${formatFiveHourText(limits)} | ${formatSevenDayText(limits)}`;
  const sonnet = formatSevenDaySonnetText(limits);
  if (!sonnet) return base;
  return `${base} | ${sonnet}`;
}
