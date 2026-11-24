/**
 * Notificações push (alertas de território).
 * O token do aparelho é registrado no servidor; quem envia é a Edge Function submit-run.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { registerPushToken, unregisterPushToken } from './api';

const K_TOKEN = 'push:token';
const K_ENABLED = 'push:enabled';
export const ALERT_CHANNEL = 'territorio-alertas';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function isPushEnabled() {
  return (await AsyncStorage.getItem(K_ENABLED)) !== '0';
}

/** Pede permissão (se ainda não pediu) e registra o token. Devolve true se ficou ativo. */
export async function enablePush(askPermission = true): Promise<boolean> {
  if (!Device.isDevice) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ALERT_CHANNEL, {
      name: 'Alertas de território',
      description: 'Avisa quando alguém está prestes a tomar ou tomou um território seu',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 300, 200, 300],
      lightColor: '#FF6A2B',
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && askPermission) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return false;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await registerPushToken(token);
  await AsyncStorage.multiSet([
    [K_TOKEN, token],
    [K_ENABLED, '1'],
  ]);
  return true;
}

/** Remove o token do servidor (usado ao desativar alertas e no logout). */
export async function disablePush(remember = true) {
  const token = await AsyncStorage.getItem(K_TOKEN);
  if (token) {
    try {
      await unregisterPushToken(token);
    } catch {
      // ignora
    }
  }
  await AsyncStorage.removeItem(K_TOKEN);
  if (remember) await AsyncStorage.setItem(K_ENABLED, '0');
}

/** Ao tocar na notificação, abre o território */
export function listenNotificationTaps() {
  const open = (data: Record<string, unknown> | undefined) => {
    const cellId = typeof data?.cellId === 'string' ? data.cellId : null;
    if (cellId && /^-?\d{1,6}_-?\d{1,6}$/.test(cellId)) {
      router.push({ pathname: '/territory/[id]', params: { id: cellId } });
    } else router.push('/alerts');
  };
  Notifications.getLastNotificationResponseAsync().then((r) => {
    if (r) open(r.notification.request.content.data);
  });
  const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data));
  return () => sub.remove();
}
