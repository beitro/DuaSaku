import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useDuaSaku } from '../context/DuaSakuContext';
import { COLORS, RADII, SHADOWS, SPACING } from '../theme/tokens';
import type { SharedNote } from '../types';
import { formatShortDateId } from '../utils/format';
import { DebtLoansPanel } from '../components/DebtLoansPanel';

export function NotesScreen(): React.JSX.Element {
  const {
    notes,
    categories,
    loading,
    createNote,
    updateNote,
    deleteNote,
    requestConfirm,
  } = useDuaSaku();
  const { height } = useWindowDimensions();

  const [subTab, setSubTab] = useState<'notes' | 'debts'>('notes');
  const [showModal, setShowModal] = useState(false);
  const [editingNote, setEditingNote] = useState<SharedNote | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [isPinned, setIsPinned] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const categoryMap = useMemo(() => {
    return new Map(categories.map((c) => [c.id, c]));
  }, [categories]);

  const sortedNotes = useMemo(() => {
    return [...notes].sort(
      (a, b) =>
        Number(b.isPinned) - Number(a.isPinned) ||
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [notes]);

  const openCreateModal = () => {
    setEditingNote(null);
    setTitle('');
    setContent('');
    setSelectedCatId(null);
    setIsPinned(true);
    setFormError(null);
    setShowModal(true);
  };

  const openEditModal = (note: SharedNote) => {
    setEditingNote(note);
    setTitle(note.title);
    setContent(note.content);
    setSelectedCatId(note.categoryId);
    setIsPinned(note.isPinned);
    setFormError(null);
    setShowModal(true);
  };

  const closeModal = () => {
    if (loading) return;
    setShowModal(false);
    setEditingNote(null);
    setFormError(null);
  };

  const handleSave = async () => {
    setFormError(null);
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 2) {
      setFormError('Judul catatan minimal 2 karakter.');
      return;
    }

    try {
      if (editingNote) {
        await updateNote(editingNote.id, {
          title: trimmedTitle,
          content: content.trim(),
          categoryId: selectedCatId,
          isPinned,
        });
      } else {
        await createNote({
          title: trimmedTitle,
          content: content.trim(),
          categoryId: selectedCatId,
          isPinned,
        });
      }
      setEditingNote(null);
      setTitle('');
      setContent('');
      setSelectedCatId(null);
      setIsPinned(true);
      setShowModal(false);
    } catch {
      // Error surfaced via FeedbackBanner
    }
  };

  const handleTogglePin = async (note: SharedNote) => {
    try {
      await updateNote(note.id, { isPinned: !note.isPinned });
    } catch {
      // Error surfaced via FeedbackBanner
    }
  };

  const handleDeletePress = (note: SharedNote) => {
    requestConfirm({
      title: 'Hapus Catatan?',
      message: `Hapus catatan "${note.title}"? Tindakan ini tidak dapat dibatalkan.`,
      confirmLabel: 'Hapus',
      cancelLabel: 'Batal',
      destructive: true,
      onConfirm: () => deleteNote(note.id),
    });
  };

  return (
    <View style={styles.container} testID="notes-screen">
      <View style={styles.subTabRow}>
        <TouchableOpacity
          style={[styles.subTabBtn, subTab === 'notes' && styles.subTabBtnActive]}
          onPress={() => setSubTab('notes')}
          testID="notes-subtab-notes"
        >
          <Text style={[styles.subTabText, subTab === 'notes' && styles.subTabTextActive]}>
            📝 Catatan Bersama
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTabBtn, subTab === 'debts' && styles.subTabBtnActive]}
          onPress={() => setSubTab('debts')}
          testID="notes-subtab-debts"
        >
          <Text style={[styles.subTabText, subTab === 'debts' && styles.subTabTextActive]}>
            🤝 Hutang & Patungan
          </Text>
        </TouchableOpacity>
      </View>

      {subTab === 'debts' ? (
        <DebtLoansPanel />
      ) : (
        <>
          <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.sectionTitle}>Catatan Bersama Pasangan</Text>
          <Text style={styles.sectionSub}>
            Simpan rencana, wishlist, dan pengingat keuangan berdua
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={openCreateModal}
          accessibilityRole="button"
          testID="notes-add-btn"
        >
          <Text style={styles.addBtnText}>+ Catatan</Text>
        </TouchableOpacity>
      </View>

      {sortedNotes.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Belum ada catatan bersama</Text>
          <Text style={styles.emptySub}>
            Tulis catatan pertama untuk daftar vendor, rencana liburan, atau pengingat tagihan.
          </Text>
        </View>
      ) : (
        sortedNotes.map((note) => {
          const linkedCat = note.categoryId ? categoryMap.get(note.categoryId) : undefined;
          return (
            <View key={note.id} style={styles.card} testID={`note-card-${note.id}`}>
              <View style={styles.noteTitleRow}>
                <Text style={styles.cardTitle}>
                  {note.isPinned ? '📌 ' : ''}
                  {note.title}
                </Text>
                {linkedCat && (
                  <View style={styles.catBadge}>
                    <Text style={styles.catBadgeText}>
                      {linkedCat.icon} {linkedCat.name}
                    </Text>
                  </View>
                )}
              </View>
              {!!note.content && <Text style={styles.noteBody}>{note.content}</Text>}
              <Text style={styles.metaText}>
                Ditulis oleh {note.authorName} · {formatShortDateId(note.updatedAt)}
              </Text>
              <View style={styles.cardActionsRow}>
                <TouchableOpacity
                  style={styles.actionPill}
                  onPress={() => handleTogglePin(note)}
                  disabled={loading}
                  accessibilityRole="button"
                  testID={`note-pin-action-${note.id}`}
                >
                  <Text style={styles.actionPillText}>
                    {note.isPinned ? 'Lepas Pin' : 'Sematkan'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionPill}
                  onPress={() => openEditModal(note)}
                  disabled={loading}
                  accessibilityRole="button"
                  testID={`note-edit-${note.id}`}
                >
                  <Text style={styles.actionPillText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionPill, styles.deletePill]}
                  onPress={() => handleDeletePress(note)}
                  disabled={loading}
                  accessibilityRole="button"
                  testID={`note-delete-${note.id}`}
                >
                  <Text style={styles.deletePillText}>Hapus</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}

      {showModal && (
        <Modal
          visible={showModal}
          transparent
          animationType={Platform.OS === 'web' ? 'none' : 'slide'}
          onRequestClose={closeModal}
          testID="note-modal"
        >
          <View
            style={[
              styles.modalBackdrop,
              Platform.OS === 'web' ? { minHeight: height } : undefined,
            ]}
          >
            <ScrollView
              contentContainerStyle={styles.modalScroll}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>
                  {editingNote ? 'Edit Catatan Bersama' : 'Catatan Baru untuk Pasangan'}
                </Text>

                <Text style={styles.label}>Judul</Text>
                <TextInput
                  style={styles.input}
                  value={title}
                  onChangeText={(text) => {
                    setTitle(text);
                    if (formError) setFormError(null);
                  }}
                  placeholder="Contoh: Vendor Catering & Dekorasi"
                  placeholderTextColor={COLORS.textPlaceholder}
                  testID="note-title-input"
                />

                <Text style={styles.label}>Isi Catatan</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  multiline
                  value={content}
                  onChangeText={setContent}
                  placeholder="Tulis rencana, wishlist, atau reminder bersama..."
                  placeholderTextColor={COLORS.textPlaceholder}
                  testID="note-content-input"
                />

                <Text style={styles.label}>Kaitkan dengan Pos (Opsional)</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.chipsScroll}
                >
                  <TouchableOpacity
                    style={[
                      styles.chip,
                      selectedCatId === null && styles.chipActive,
                    ]}
                    onPress={() => setSelectedCatId(null)}
                    testID="note-category-none"
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selectedCatId === null && styles.chipTextActive,
                      ]}
                    >
                      Tanpa Pos
                    </Text>
                  </TouchableOpacity>
                  {categories.map((cat) => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.chip,
                        selectedCatId === cat.id && styles.chipActive,
                      ]}
                      onPress={() => setSelectedCatId(cat.id)}
                      testID={`note-category-${cat.id}`}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          selectedCatId === cat.id && styles.chipTextActive,
                        ]}
                      >
                        {cat.icon} {cat.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <TouchableOpacity
                  style={styles.pinToggleRow}
                  onPress={() => setIsPinned((prev) => !prev)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isPinned }}
                  testID="note-pin-toggle"
                >
                  <View style={[styles.checkbox, isPinned && styles.checkboxActive]}>
                    {isPinned && <Text style={styles.checkboxMark}>✓</Text>}
                  </View>
                  <Text style={styles.pinToggleText}>Sematkan di bagian atas (Pin)</Text>
                </TouchableOpacity>

                {!!formError && (
                  <View style={styles.inlineErrorBox}>
                    <Text style={styles.inlineErrorText}>{formError}</Text>
                  </View>
                )}

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={closeModal}
                    disabled={loading}
                    testID="note-cancel-btn"
                  >
                    <Text style={styles.cancelBtnText}>Batal</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
                    onPress={handleSave}
                    disabled={loading}
                    testID="note-save-btn"
                  >
                    {loading ? (
                      <ActivityIndicator color={COLORS.white} size="small" />
                    ) : (
                      <Text style={styles.saveBtnText}>
                        {editingNote ? 'Simpan Perubahan' : 'Simpan Catatan'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </View>
        </Modal>
      )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  headerText: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  sectionSub: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textMuted,
    marginTop: 2,
  },
  addBtn: {
    backgroundColor: COLORS.sageSoft,
    borderWidth: 1,
    borderColor: COLORS.sage,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.sageDark,
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  emptySub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACING.md + 2,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  noteTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
    flex: 1,
  },
  catBadge: {
    backgroundColor: COLORS.warmSand,
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  catBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  noteBody: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    lineHeight: 19,
  },
  metaText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
  },
  cardActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.sm + 2,
  },
  actionPill: {
    backgroundColor: COLORS.warmSand,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
  },
  actionPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  deletePill: {
    backgroundColor: COLORS.terracottaSoft,
    borderColor: COLORS.terracotta,
  },
  deletePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.terracottaDark,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: COLORS.backdrop,
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  modalScroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADII.xl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.elevated,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: SPACING.lg,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs + 2,
  },
  input: {
    backgroundColor: COLORS.bgCream,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    fontSize: 14,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  textArea: {
    height: 96,
    textAlignVertical: 'top',
  },
  chipsScroll: {
    marginBottom: SPACING.md,
  },
  chip: {
    backgroundColor: COLORS.warmSand,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    marginRight: SPACING.sm,
  },
  chipActive: {
    backgroundColor: COLORS.terracottaSoft,
    borderColor: COLORS.terracotta,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  chipTextActive: {
    color: COLORS.terracottaDark,
    fontWeight: '800',
  },
  pinToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
    paddingVertical: SPACING.xs,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.bgCream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: COLORS.terracottaBtn,
    borderColor: COLORS.terracottaBtn,
  },
  checkboxMark: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '800',
  },
  pinToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  inlineErrorBox: {
    backgroundColor: COLORS.terracottaSoft,
    borderWidth: 1,
    borderColor: COLORS.terracotta,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
  },
  inlineErrorText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.terracottaDark,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
  },
  cancelBtn: {
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.md,
    backgroundColor: COLORS.warmSand,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 42,
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  saveBtn: {
    backgroundColor: COLORS.terracottaBtn,
    borderRadius: RADII.md,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.lg,
    minHeight: 42,
    minWidth: 130,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.65,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.white,
  },
  subTabRow: {
    flexDirection: 'row',
    gap: SPACING.xs + 2,
    marginBottom: SPACING.md,
  },
  subTabBtn: {
    flex: 1,
    backgroundColor: COLORS.warmSand,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.pill,
    paddingVertical: 9,
    alignItems: 'center',
  },
  subTabBtnActive: {
    backgroundColor: COLORS.heroCocoa,
    borderColor: COLORS.heroCocoa,
  },
  subTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  subTabTextActive: {
    color: COLORS.textOnDark,
  },
});
