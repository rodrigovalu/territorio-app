export const fmtKm = (km: number, digits = 1) =>
  km.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function fmtDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** ritmo em min/km */
export function fmtPace(seconds: number, km: number) {
  if (km < 0.05) return '--:--';
  const p = seconds / km;
  return `${Math.floor(p / 60)}:${String(Math.round(p % 60)).padStart(2, '0')}`;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Mês da disputa no fuso de Brasília (UTC−3, sem horário de verão desde 2019). */
export function currentMonthInfo(now = new Date()) {
  const br = new Date(now.getTime() - 3 * 3600 * 1000);
  const y = br.getUTCFullYear();
  const m = br.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const daysLeft = lastDay - br.getUTCDate();
  return { label: `${MESES[m]} de ${y}`, daysLeft };
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** ritmo a partir de segundos por km: 332 → "5:32" */
export function fmtPaceS(secPerKm: number | null | undefined) {
  if (secPerKm == null || !Number.isFinite(secPerKm) || secPerKm <= 0 || secPerKm > 3600) return '--:--';
  const r = Math.round(secPerKm);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
}

export function fmtDayLong(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
