import AsyncStorage from '@react-native-async-storage/async-storage';

export type Settings = {
  /** avisos de voz durante a corrida */
  voice: boolean;
  /** de quantos em quantos km avisar (1 = todo km) */
  voiceEveryKm: 1 | 2 | 5;
  /** falar o pace do último km */
  voiceSplitPace: boolean;
  /** contagem regressiva antes de iniciar */
  countdown: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  voice: true,
  voiceEveryKm: 1,
  voiceSplitPace: true,
  countdown: true,
};

const KEY = 'settings:v1';

export async function getSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(patch: Partial<Settings>) {
  const next = { ...(await getSettings()), ...patch };
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
