import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppFrame } from '../components/AppFrame';
import { PressableButton } from '../components/PressableButton';
import { useDuaSaku } from '../context/DuaSakuContext';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../theme/tokens';

const SECTIONS: { key: string; label: string; desc: string }[] = [
  { key: 'profile', label: 'Profil', desc: 'Nama, avatar, peran' },
  { key: 'currency', label: 'Mata Uang', desc: 'Pilih mata uang tampilan' },
  { key: 'preference', label: 'Preferensi', desc: 'Tema, format tanggal' },
  { key: 'security', label: 'Keamanan', desc: 'Kunci aplikasi, PIN' },
  { key: 'notifications', label: 'Notifikasi', desc: 'Peringatan anggaran & pengingat' },
  { key: 'budget', label: 'Anggaran', desc: 'Batas bulanan' },
  { key: 'category', label: 'Kategori', desc: 'Kelola kategori' },
  { key: 'accounts', label: 'Akun', desc: 'Dompet & rekening' },
  { key: 'space', label: 'Ruang Pasangan', desc: 'Kode undangan, keluar' },
  { key: 'about', label: 'Tentang', desc: 'Versi, kebijakan' },
];

export function SettingsScreen(): React.JSX.Element {
  const { me, logout } = useDuaSaku();
  return (
    <AppFrame>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={TYPOGRAPHY.title}>Pengaturan</Text>
        {me && <Text style={TYPOGRAPHY.caption}>Halo, {me.name}</Text>}
        {SECTIONS.map((s) => (
          <View key={s.key} style={styles.card}>
            <Text style={TYPOGRAPHY.cardTitle}>{s.label}</Text>
            <Text style={TYPOGRAPHY.caption}>{s.desc}</Text>
          </View>
        ))}
        <PressableButton variant="danger" size="md" onPress={logout}>
          Keluar dari Ruang
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
