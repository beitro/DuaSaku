import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AppFrame } from './src/components/AppFrame';
import { AppLockGate } from './src/components/AppLockGate';
import { ConfirmModal } from './src/components/ConfirmModal';
import { FeedbackBanner } from './src/components/FeedbackBanner';
import { MonthSelector } from './src/components/MonthSelector';
import { ProfileExportModal } from './src/components/ProfileExportModal';
import { QuickEntrySheet } from './src/components/QuickEntrySheet';
import { DuaSakuProvider, useDuaSaku } from './src/context/DuaSakuContext';
import { AccountsScreen } from './src/screens/AccountsScreen';
import { AnalyticsScreen } from './src/screens/AnalyticsScreen';
import { BudgetsScreen } from './src/screens/BudgetsScreen';
import { CategoriesScreen } from './src/screens/CategoriesScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { NotesScreen } from './src/screens/NotesScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { TransactionsScreen } from './src/screens/TransactionsScreen';
import { COLORS, RADII, SPACING } from './src/theme/tokens';
import type { TabKey } from './src/types';

const PRIMARY_TABS: ReadonlyArray<{ key: TabKey; label: string; icon: string }> = [
  { key: 'dashboard', label: 'Ringkas', icon: '🏠' },
  { key: 'transactions', label: 'Transaksi', icon: '🧾' },
  { key: 'analytics', label: 'Analitik', icon: '📊' },
  { key: 'accounts', label: 'Dompet', icon: '👛' },
  { key: 'budgets', label: 'Anggaran', icon: '🎯' },
];

const MONTHLY_TABS = new Set<TabKey>([
  'dashboard',
  'transactions',
  'analytics',
  'budgets',
]);

function AppContent(): React.JSX.Element {
  const {
    token,
    couple,
    me,
    hydrating,
    loading,
    refreshing,
    activeTab,
    setActiveTab,
    selectedMonth,
    setSelectedMonth,
    feedback,
    clearFeedback,
    confirmState,
    closeConfirm,
    executeConfirm,
    openNewTransaction,
    requestConfirm,
    refreshAll,
    logout,
  } = useDuaSaku();
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [activeTab, fadeAnim]);
  const [tabHistory, setTabHistory] = useState<TabKey[]>([]);

  useEffect(() => {
    setTabHistory((prev) =>
      prev.length > 0 && prev[prev.length - 1] === activeTab ? prev : [...prev, activeTab],
    );
  }, [activeTab]);

  useEffect(() => {
    const onBack = () => {
      if (tabHistory.length <= 1) return false;
      const next = tabHistory.slice(0, -1);
      const target = next[next.length - 1];
      if (target) setActiveTab(target);
      setTabHistory(next);
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [tabHistory, setActiveTab]);

  useEffect(() => {
    if (!token || !couple) return;
    const handleDeepLink = (rawUrl: string | null | undefined) => {
      if (!rawUrl || !rawUrl.includes('quick-add')) return;
      const match = /[?&]type=(expense|income|transfer)/i.exec(rawUrl);
      const kind = match ? match[1].toLowerCase() : 'expense';
      if (kind === 'transfer') {
        setActiveTab('accounts');
      } else if (kind === 'income') {
        openNewTransaction('income');
      } else {
        openNewTransaction('expense');
      }
    };
    Linking.getInitialURL().then(handleDeepLink).catch(() => {});
    const sub = Linking.addEventListener('url', (e) => handleDeepLink(e.url));
    return () => sub.remove();
  }, [token, couple, openNewTransaction, setActiveTab]);

  const handleLogoutPress = () => {
    requestConfirm({
      title: 'Keluar dari Ruang?',
      message:
        'Anda akan keluar dari sesi pasangan di perangkat ini. Simpan kode undangan untuk bergabung kembali.',
      confirmLabel: 'Keluar',
      cancelLabel: 'Batal',
      destructive: true,
      onConfirm: logout,
    });
  };

  if (hydrating) {
    return (
      <AppFrame>
        <StatusBar style="dark" />
        <View style={styles.splash}>
          <ActivityIndicator size="large" color={COLORS.terracotta} />
          <Text style={styles.splashText}>Memuat ruang keuangan...</Text>
        </View>
      </AppFrame>
    );
  }

  if (!token || !me) {
    return (
      <>
        <StatusBar style="dark" />
        <OnboardingScreen />
      </>
    );
  }

  if (!couple) {
    return (
      <AppFrame>
        <StatusBar style="dark" />
        <View style={styles.offlineBox}>
          <FeedbackBanner feedback={feedback} onDismiss={clearFeedback} />
          <Text style={styles.offlineTitle}>Tidak Dapat Terhubung ke Server</Text>
          <Text style={styles.offlineText}>
            Sesi Anda sebagai {me.name} masih tersimpan. Periksa koneksi internet lalu coba muat
            ulang ruang pasangan.
          </Text>
          <TouchableOpacity
            style={[styles.retryBtn, refreshing && styles.retryBtnDisabled]}
            onPress={refreshAll}
            disabled={refreshing}
            accessibilityRole="button"
            testID="retry-sync-btn"
          >
            {refreshing ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.retryBtnText}>Coba Muat Ulang</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.offlineLogoutBtn}
            onPress={handleLogoutPress}
            accessibilityRole="button"
            testID="offline-logout-btn"
          >
            <Text style={styles.logoutBtnText}>Keluar dari Sesi</Text>
          </TouchableOpacity>
        </View>
        <ConfirmModal
          visible={Boolean(confirmState?.visible)}
          title={confirmState?.title ?? ''}
          message={confirmState?.message ?? ''}
          confirmLabel={confirmState?.confirmLabel}
          cancelLabel={confirmState?.cancelLabel}
          destructive={confirmState?.destructive}
          loading={confirmState?.loading}
          onConfirm={executeConfirm}
          onCancel={closeConfirm}
        />
      </AppFrame>
    );
  }

  return (
    <AppFrame>
      <StatusBar style="dark" />
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {couple.coupleName}
            </Text>
            <View style={styles.headerSubRow}>
              <Text style={styles.headerSub} numberOfLines={1}>
                Halo, {me.name} · {me.roleLabel}
              </Text>
              <View style={styles.inviteBadge} testID="header-invite-code">
                <Text style={styles.inviteBadgeText}>Kode: {couple.inviteCode}</Text>
              </View>
            </View>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.addTxBtn}
              onPress={() => setActiveTab('settings')}
              accessibilityRole="button"
              testID="header-settings-btn"
            >
              <Text style={styles.addTxBtnText}>⚙️</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addTxBtn}
              onPress={() => openNewTransaction('expense')}
              accessibilityRole="button"
              testID="header-add-tx-btn"
            >
              <Text style={styles.addTxBtnText}>➕ Catat</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.logoutBtn}
              onPress={handleLogoutPress}
              accessibilityRole="button"
              testID="header-logout-btn"
            >
              <Text style={styles.logoutBtnText}>🚪 Keluar</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Secondary Utility Bar: Pos & Target + Catatan */}
        <View style={styles.utilityRow}>
          <TouchableOpacity
            style={[
              styles.utilityPill,
              activeTab === 'categories' && styles.utilityPillActive,
            ]}
            onPress={() => setActiveTab('categories')}
            accessibilityRole="button"
            testID="nav-pill-categories"
          >
            <Text
              style={[
                styles.utilityPillText,
                activeTab === 'categories' && styles.utilityPillTextActive,
              ]}
            >
              🗂️ Pos & Target
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.utilityPill,
              activeTab === 'notes' && styles.utilityPillActive,
            ]}
            onPress={() => setActiveTab('notes')}
            accessibilityRole="button"
            testID="nav-pill-notes"
          >
            <Text
              style={[
                styles.utilityPillText,
                activeTab === 'notes' && styles.utilityPillTextActive,
              ]}
            >
              📝 Catatan
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.utilityPill,
              profileModalVisible && styles.utilityPillActive,
            ]}
            onPress={() => setProfileModalVisible(true)}
            accessibilityRole="button"
            testID="nav-pill-profile"
          >
            <Text
              style={[
                styles.utilityPillText,
                profileModalVisible && styles.utilityPillTextActive,
              ]}
            >
              ⚙️ Profil & Ekspor
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
      >
        {MONTHLY_TABS.has(activeTab) && (
          <MonthSelector
            month={selectedMonth}
            onChangeMonth={setSelectedMonth}
            disabled={loading}
          />
        )}

        <FeedbackBanner feedback={feedback} onDismiss={clearFeedback} />

        {activeTab === 'dashboard' && <DashboardScreen />}
        {activeTab === 'transactions' && <TransactionsScreen />}
        {activeTab === 'analytics' && <AnalyticsScreen />}
        {activeTab === 'accounts' && <AccountsScreen />}
        {activeTab === 'budgets' && <BudgetsScreen />}
        {activeTab === 'categories' && <CategoriesScreen />}
        {activeTab === 'notes' && <NotesScreen />}
        {activeTab === 'settings' && <SettingsScreen />}
      </ScrollView>

      {/* 5-Tab Bottom Bar */}
      <View style={styles.tabBar} accessibilityRole="tablist">
        {PRIMARY_TABS.map((tab) => {
          const selected = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabItem, selected && styles.tabItemActive]}
              onPress={() => setActiveTab(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              testID={`tab-${tab.key}`}
            >
              <Text style={styles.tabIcon}>{tab.icon}</Text>
              <Text
                style={[styles.tabLabel, selected && styles.tabLabelActive]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Global Overlays */}
      <QuickEntrySheet />
      <ProfileExportModal
        visible={profileModalVisible}
        onClose={() => setProfileModalVisible(false)}
      />
      <ConfirmModal
        visible={Boolean(confirmState?.visible)}
        title={confirmState?.title ?? ''}
        message={confirmState?.message ?? ''}
        confirmLabel={confirmState?.confirmLabel}
        cancelLabel={confirmState?.cancelLabel}
        destructive={confirmState?.destructive}
        loading={confirmState?.loading}
        onConfirm={executeConfirm}
        onCancel={closeConfirm}
      />
      </Animated.View>
    </AppFrame>
  );
}

export default function App(): React.JSX.Element {
  return (
    <DuaSakuProvider>
      <AppLockGate>
        <AppContent />
      </AppLockGate>
    </DuaSakuProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    padding: SPACING.xl,
  },
  splashText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  offlineBox: {
    flex: 1,
    justifyContent: 'center',
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  offlineTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  offlineText: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: COLORS.terracottaBtn,
    borderRadius: RADII.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  retryBtnDisabled: {
    opacity: 0.65,
  },
  retryBtnText: {
    color: COLORS.white,
    fontWeight: '800',
    fontSize: 14,
  },
  offlineLogoutBtn: {
    backgroundColor: COLORS.warmSand,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingVertical: SPACING.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
  },
  header: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm + 2,
    gap: SPACING.sm,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.xs + 2,
    marginTop: 3,
  },
  headerSub: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  inviteBadge: {
    backgroundColor: COLORS.warmSand,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  inviteBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.terracottaDark,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs + 2,
  },
  addTxBtn: {
    backgroundColor: COLORS.terracottaBtn,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.md,
    minHeight: 36,
    justifyContent: 'center',
  },
  addTxBtnText: {
    color: COLORS.white,
    fontWeight: '800',
    fontSize: 13,
  },
  logoutBtn: {
    backgroundColor: COLORS.warmSand,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.md,
    minHeight: 36,
    justifyContent: 'center',
  },
  logoutBtnText: {
    color: COLORS.textSecondary,
    fontWeight: '700',
    fontSize: 12,
  },
  utilityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  utilityPill: {
    backgroundColor: COLORS.warmSand,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 1,
  },
  utilityPillActive: {
    backgroundColor: COLORS.terracottaSoft,
    borderColor: COLORS.terracotta,
  },
  utilityPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  utilityPillTextActive: {
    color: COLORS.terracottaDark,
    fontWeight: '800',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingBottom: SPACING.xxl,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.xs + 2,
    paddingBottom: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xs,
    borderRadius: RADII.md,
  },
  tabItemActive: {
    backgroundColor: COLORS.terracottaSoft,
  },
  tabIcon: {
    fontSize: 16,
    marginBottom: 2,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  tabLabelActive: {
    color: COLORS.terracottaDark,
    fontWeight: '800',
  },
});
