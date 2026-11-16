import { Text, View } from 'react-native';

import { LEGAL_SECTIONS } from '@/legal';
import { colors } from '@/theme';

export function LegalText() {
  return (
    <View style={{ gap: 18 }}>
      {LEGAL_SECTIONS.map((s) => (
        <View key={s.title}>
          <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700', marginBottom: 6 }}>{s.title}</Text>
          <Text style={{ color: colors.mute, fontSize: 14.5, lineHeight: 21 }}>{s.body}</Text>
        </View>
      ))}
    </View>
  );
}
