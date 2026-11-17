import * as Haptics from 'expo-haptics';
import { SymbolView, type AndroidSymbol } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, StyleSheet, Text, View } from 'react-native';

import type { Medal as MedalT } from '@/lib/api';
import { dismissMedal, nextMedal, onCelebrate } from '@/lib/celebrate';
import { colors } from '@/theme';

import { Button } from './ui';

export const TIER_COLORS: Record<MedalT['tier'], { fg: string; bg: string; label: string }> = {
  bronze: { fg: '#E0A36B', bg: '#3A2616', label: 'Bronze' },
  prata: { fg: '#D9E1EA', bg: '#2A3038', label: 'Prata' },
  ouro: { fg: '#FFD23F', bg: '#3A3010', label: 'Ouro' },
  diamante: { fg: '#7DE3FF', bg: '#0F2E3A', label: 'Diamante' },
};

export function MedalIcon({
  icon,
  tier,
  size = 64,
  locked = false,
}: {
  icon: string;
  tier: MedalT['tier'];
  size?: number;
  locked?: boolean;
}) {
  const c = TIER_COLORS[tier];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: locked ? colors.panel : c.bg,
        borderWidth: Math.max(2, size / 16),
        borderColor: locked ? colors.line : c.fg,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <SymbolView
        name={{ android: (locked ? 'lock' : icon) as AndroidSymbol, ios: locked ? 'lock' : 'medal' }}
        tintColor={locked ? colors.mute : c.fg}
        size={size * 0.48}
      />
    </View>
  );
}

/** Modal de comemoração, montado uma vez no layout raiz */
export function MedalCelebration() {
  const [medal, setMedal] = useState<MedalT | null>(nextMedal());
  const scale = useRef(new Animated.Value(0.3)).current;

  useEffect(() => onCelebrate(() => setMedal(nextMedal())), []);

  useEffect(() => {
    if (!medal) return;
    scale.setValue(0.3);
    Animated.spring(scale, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }).start();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [medal, scale]);

  if (!medal) return null;
  const c = TIER_COLORS[medal.tier];
  return (
    <Modal transparent animationType="fade" visible onRequestClose={dismissMedal}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <Text style={s.kicker}>NOVA MEDALHA!</Text>
          <Animated.View style={{ transform: [{ scale }], marginVertical: 22 }}>
            <MedalIcon icon={medal.icon} tier={medal.tier} size={132} />
          </Animated.View>
          <Text style={s.title}>{medal.title}</Text>
          <Text style={[s.tier, { color: c.fg }]}>{c.label}</Text>
          <Text style={s.desc}>{medal.description}</Text>
          <Button title="Continuar" onPress={dismissMedal} style={{ alignSelf: 'stretch', marginTop: 22 }} />
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: {
    backgroundColor: colors.panel,
    borderRadius: 24,
    padding: 26,
    alignItems: 'center',
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: colors.line,
  },
  kicker: { color: colors.accent, fontWeight: '900', letterSpacing: 2, fontSize: 13 },
  title: { color: colors.ink, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  tier: { fontWeight: '800', marginTop: 4, textTransform: 'uppercase', letterSpacing: 1, fontSize: 12 },
  desc: { color: colors.mute, fontSize: 15, textAlign: 'center', marginTop: 10, lineHeight: 21 },
});
