export interface LimitsData {
  fiveHour: number;
  sevenDay: number;
  fiveHourResetsAt?: string;
  sevenDayResetsAt?: string;
}

const BAR_WIDTH = 6;

export function parseLimits(jsonStr: string): LimitsData | null {
  try {
    const data = JSON.parse(jsonStr);
    const fh = data?.five_hour?.used_percentage;
    const sd = data?.seven_day?.used_percentage;
    if (typeof fh !== 'number' || typeof sd !== 'number') return null;
    return {
      fiveHour: fh,
      sevenDay: sd,
      fiveHourResetsAt: data.five_hour?.resets_at,
      sevenDayResetsAt: data.seven_day?.resets_at,
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
  const time = limits.fiveHourResetsAt ? ` (~${formatTimeRemaining(limits.fiveHourResetsAt)})` : '';
  return `Сессия: ${bar} ${limits.fiveHour}%${time}`;
}

export function formatSevenDayText(limits: LimitsData): string {
  const bar = formatProgressBar(limits.sevenDay);
  const time = limits.sevenDayResetsAt ? ` (~${formatTimeRemaining(limits.sevenDayResetsAt)})` : '';
  return `Неделя: ${bar} ${limits.sevenDay}%${time}`;
}

export function formatStatusText(limits: LimitsData): string {
  return `${formatFiveHourText(limits)} | ${formatSevenDayText(limits)}`;
}
