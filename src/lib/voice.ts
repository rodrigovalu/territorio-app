import * as Speech from 'expo-speech';

import type { Split } from '../../supabase/functions/_shared/validateRun';
import type { Settings } from './settings';

const LANG = 'pt-BR';

/** "1 hora, 5 minutos e 30 segundos" */
export function spokenDuration(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} ${h === 1 ? 'hora' : 'horas'}`);
  if (m) parts.push(`${m} ${m === 1 ? 'minuto' : 'minutos'}`);
  if (sec || !parts.length) parts.push(`${sec} ${sec === 1 ? 'segundo' : 'segundos'}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}` : parts[0];
}

/** pace "5 e 32" → "5 minutos e 32 segundos por quilômetro" */
export function spokenPace(secPerKm: number) {
  return `${spokenDuration(secPerKm)} por quilômetro`;
}

export function say(text: string) {
  Speech.stop();
  Speech.speak(text, { language: LANG, rate: 1.0, pitch: 1.0 });
}

/** Aviso a cada km completado */
export function announceSplit(split: Split, settings: Settings) {
  if (!settings.voice || split.km % settings.voiceEveryKm !== 0) return;
  const avg = split.totalS / split.km;
  let text =
    `${split.km} ${split.km === 1 ? 'quilômetro' : 'quilômetros'}. ` +
    `Tempo: ${spokenDuration(split.totalS)}. ` +
    `Pace médio: ${spokenPace(avg)}.`;
  if (settings.voiceSplitPace) text += ` Último quilômetro: ${spokenDuration(split.s)}.`;
  say(text);
}
