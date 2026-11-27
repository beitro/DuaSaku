import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppFrame } from '../components/AppFrame';
import { PressableButton } from '../components/PressableButton';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../theme/tokens';

const SECTIONS = [
  { key: 'about', label: 'Tentang' },
  { key: 'currency', label: 'Mata Uang' },
  { key: 'preference', label: 'Preferensi' },
  { key: 'security', label: 'Keamanan' },
  { key: 'notifications', label: 'Notifikasi' },
  { key: 'budget', label: 'Anggaran' },
  { key: 'category', label: 'Kategori' },
  { key: 'accounts', label: 'Akun' },
  { key: 'space', label: 'Ruang Pasangan' },
];

export function SettingsScreen(): React.JSX.Element {
  return (
    <AppFrame>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={TYPOGRAPHY.title}>Pengaturan</Text>
        {SECTIONS.map((s) => (
          <View key={s.key} style={styles.card}>
            <Text style={TYPOGRAPHY.cardTitle}>{s.label}</Text>
            <Text style={TYPOGRAPHY.caption}>Konfigurasi {s.label.toLowerCase()} di sini.</Text>
          </View>
        ))}
        <PressableButton variant="ghost" size="md" onPress={() => {}}>
          Kembali
        </PressableButton>
      </ScrollView>
    </AppFrame>
  );
}

const styles = StyleSheet.create({
  container: { padding: SPACING.lg, gap: SPACING.md },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
});
