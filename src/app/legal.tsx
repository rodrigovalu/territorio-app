import { ScrollView } from 'react-native';

import { LegalText } from '@/components/LegalText';
import { styles as ui } from '@/components/ui';

export default function Legal() {
  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <LegalText />
    </ScrollView>
  );
}
