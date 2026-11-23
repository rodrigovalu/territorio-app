import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View, type TextStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/theme';

import { LegalText } from './LegalText';

/**
 * Link que abre os Termos e a Política de Privacidade numa janela por cima da tela atual.
 * (Não é uma rota: assim a tela de termos nunca vira a tela inicial do app.)
 */
export function LegalLink({ label, style }: { label: string; style?: TextStyle }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Text onPress={() => setOpen(true)} style={[{ color: colors.accent }, style]} accessibilityRole="link">
        {label}
      </Text>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: colors.line,
            }}>
            <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '800' }}>Termos e privacidade</Text>
            <Pressable onPress={() => setOpen(false)} accessibilityRole="button" hitSlop={12}>
              <Text style={{ color: colors.accent, fontSize: 16, fontWeight: '700' }}>Fechar</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
            <LegalText />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
