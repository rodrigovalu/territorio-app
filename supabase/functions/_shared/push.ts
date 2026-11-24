// Envio de notificações push pelo serviço do Expo (que entrega via FCM no Android).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type TerritoryAlert = {
  id: string;
  user_id: string;
  kind: 'threat' | 'lost';
  cell_id: string;
  challenger: string | null;
  gap_km: number;
};

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

function message(a: TerritoryAlert) {
  const who = a.challenger || 'Outro corredor';
  if (a.kind === 'lost') {
    return {
      title: '🏳️ Você perdeu um território',
      body: `${who} acabou de conquistar o território ${a.cell_id}. Corra lá para retomar!`,
    };
  }
  return {
    title: '⚠️ Seu território está em perigo!',
    body: `${who} está a apenas ${fmt(a.gap_km)} km de tomar o território ${a.cell_id}. Corra para manter o domínio!`,
  };
}

/** Nunca lança erro: falha no push não pode impedir o registro da corrida. */
export async function sendTerritoryAlerts(admin: SupabaseClient, alerts: TerritoryAlert[]) {
  try {
    if (!alerts.length) return;
    const userIds = [...new Set(alerts.map((a) => a.user_id))];
    const { data: tokens } = await admin.from('push_tokens').select('token, user_id').in('user_id', userIds);
    if (!tokens?.length) return;

    const messages = alerts.flatMap((a) =>
      tokens
        .filter((t) => t.user_id === a.user_id)
        .map((t) => ({
          to: t.token,
          sound: 'default',
          priority: 'high',
          channelId: 'territorio-alertas',
          ...message(a),
          data: { type: 'territory', kind: a.kind, cellId: a.cell_id, alertId: a.id },
        })),
    );

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(messages.slice(0, 100)),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const out = await res.json().catch(() => null);

    // remove tokens de aparelhos que desinstalaram o app
    const dead: string[] = [];
    (out?.data ?? []).forEach((r: { status?: string; details?: { error?: string } }, i: number) => {
      if (r?.status === 'error' && r.details?.error === 'DeviceNotRegistered') dead.push(messages[i].to);
    });
    if (dead.length) await admin.from('push_tokens').delete().in('token', dead);
  } catch (e) {
    console.error('push', e);
  }
}
