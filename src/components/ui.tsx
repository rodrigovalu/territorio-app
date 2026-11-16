import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors } from '@/theme';

type BtnProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

export function Button({ title, onPress, variant = 'primary', loading, disabled, style }: BtnProps) {
  const bg =
    variant === 'primary' ? colors.accent : variant === 'danger' ? colors.danger : variant === 'secondary' ? colors.panel : 'transparent';
  const fg = variant === 'primary' ? '#111' : variant === 'danger' ? '#fff' : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'secondary' && { borderWidth: 1, borderColor: colors.line },
        style,
      ]}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.btnText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Title({ children }: { children: React.ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Sub({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sub}>{children}</Text>;
}

export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function Dot({ color, size = 12 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: 16 },
  btn: { paddingVertical: 15, paddingHorizontal: 18, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 16, fontWeight: '700' },
  title: { color: colors.ink, fontSize: 24, fontWeight: '800', letterSpacing: 0.3 },
  sub: { color: colors.mute, fontSize: 13.5, marginTop: 2 },
  stat: {
    flex: 1,
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statValue: { color: colors.ink, fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { color: colors.mute, fontSize: 12, marginTop: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowText: { color: colors.ink, fontSize: 15, flex: 1 },
  rowSmall: { color: colors.mute, fontSize: 12 },
  rowValue: { color: colors.ink, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  error: { color: colors.danger, fontSize: 14, marginTop: 10 },
});
