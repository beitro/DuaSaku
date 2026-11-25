import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ApiError, duaSakuApi } from '../api/client';
import type { FeedbackKind, FeedbackState } from '../components/FeedbackBanner';
import type {
  AccountTotals,
  AccountTransfer,
  AuthResponse,
  CategoryGoal,
  CoupleAccount,
  CoupleSpace,
  CoupleSummary,
  CoupleTransaction,
  CreateAccountPayload,
  CreateCategoryPayload,
  CreateDebtLoanPayload,
  CreateNotePayload,
  CreateQuickPresetPayload,
  CreateRecurringRulePayload,
  CreateTransactionPayload,
  DebtLoan,
  MonthlyAnalytics,
  MonthlyBudget,
  PartnerProfile,
  PayRecurringRulePayload,
  PayRecurringRuleResponse,
  QuickPreset,
  ReceiptParseResult,
  RecurringRule,
  SettleDebtLoanPayload,
  SharedNote,
  TabKey,
  TransactionType,
  TransferAccountPayload,
  TransferAccountResponse,
  UpdateAccountPayload,
  UpdateBudgetPayload,
  UpdateCategoryPayload,
  UpdateCouplePayload,
  UpdateCoupleResponse,
  UpdateNotePayload,
  UpdateRecurringRulePayload,
  UpdateTransactionPayload,
  UpsertBudgetPayload,
} from '../types';
import { triggerExportDownload } from '../utils/export';
import { getCurrentMonthKey, getLocalTzOffset, isValidMonthKey } from '../utils/format';
import {
  clearSession,
  getStorageItem,
  loadSession,
  MONTH_STORAGE_KEY,
  saveSession,
  setStorageItem,
} from '../utils/storage';

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => Promise<void> | void;
}

export interface ConfirmState extends ConfirmRequest {
  visible: boolean;
  loading: boolean;
}

export interface QuickEntryState {
  visible: boolean;
  mode: 'create' | 'edit';
  editingTx: CoupleTransaction | null;
  defaultType: TransactionType;
  presetAmount: number | null;
  presetCategoryId: string | null;
}

export interface BudgetTotals {
  month: string;
  totalLimit: number;
  totalSpent: number;
  totalRemaining: number;
}

export interface DuaSakuContextValue {
  // Session & Navigation
  token: string | null;
  couple: CoupleSpace | null;
  me: PartnerProfile | null;
  hydrating: boolean;
  loading: boolean;
  refreshing: boolean;
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;

  // Domain Data
  categories: CategoryGoal[];
  accounts: CoupleAccount[];
  accountTotals: AccountTotals;
  transfers: AccountTransfer[];
  transactions: CoupleTransaction[];
  budgets: MonthlyBudget[];
  budgetTotals: BudgetTotals;
  summary: CoupleSummary | null;
  analytics: MonthlyAnalytics | null;
  notes: SharedNote[];
  recurringRules: RecurringRule[];
  debtLoans: DebtLoan[];
  quickPresets: QuickPreset[];

  // Feedback & Confirmation
  feedback: FeedbackState | null;
  showError: (message: string, title?: string) => void;
  showSuccess: (message: string, title?: string) => void;
  showInfo: (message: string, title?: string) => void;
  clearFeedback: () => void;
  confirmState: ConfirmState | null;
  requestConfirm: (req: ConfirmRequest) => void;
  closeConfirm: () => void;
  executeConfirm: () => Promise<void>;

  // Quick Entry Sheet
  quickEntry: QuickEntryState;
  quickEntryOpen: boolean;
  openNewTransaction: (
    defaultType?: TransactionType,
    presetAmount?: number,
    presetCategoryId?: string
  ) => void;
  openEditTransaction: (tx: CoupleTransaction) => void;
  closeQuickEntry: () => void;

  // API Actions
  registerAccount: (payload: {
    email: string;
    password: string;
    partnerName: string;
    mode: 'create' | 'join';
    coupleName?: string;
    inviteCode?: string;
  }) => Promise<void>;
  loginAccount: (email: string, password: string) => Promise<void>;
  createCouple: (coupleName: string, partnerName: string) => Promise<void>;
  joinCouple: (inviteCode: string, partnerName: string) => Promise<void>;
  updateCoupleProfile: (payload: UpdateCouplePayload) => Promise<UpdateCoupleResponse>;
  logout: () => void;
  refreshAll: () => Promise<void>;
  createTransaction: (payload: CreateTransactionPayload) => Promise<CoupleTransaction>;
  updateTransaction: (id: string, payload: UpdateTransactionPayload) => Promise<CoupleTransaction>;
  deleteTransaction: (id: string) => Promise<void>;
  createAccount: (payload: CreateAccountPayload) => Promise<CoupleAccount>;
  updateAccount: (id: string, payload: UpdateAccountPayload) => Promise<CoupleAccount>;
  deleteAccount: (id: string) => Promise<void>;
  transferAccounts: (payload: TransferAccountPayload) => Promise<TransferAccountResponse>;
  saveBudget: (payload: UpsertBudgetPayload) => Promise<MonthlyBudget>;
  updateBudget: (id: string, payload: UpdateBudgetPayload) => Promise<MonthlyBudget>;
  deleteBudget: (id: string) => Promise<void>;
  createCategory: (payload: CreateCategoryPayload) => Promise<CategoryGoal>;
  updateCategory: (id: string, payload: UpdateCategoryPayload) => Promise<CategoryGoal>;
  deleteCategory: (id: string) => Promise<void>;
  createNote: (payload: CreateNotePayload) => Promise<SharedNote>;
  updateNote: (id: string, payload: UpdateNotePayload) => Promise<SharedNote>;
  deleteNote: (id: string) => Promise<void>;
  addRecurringRule: (payload: CreateRecurringRulePayload) => Promise<RecurringRule>;
  toggleRecurringRule: (id: string, active?: boolean) => Promise<RecurringRule>;
  updateRecurringRule: (id: string, payload: UpdateRecurringRulePayload) => Promise<RecurringRule>;
  payRecurringRule: (
    id: string,
    payload?: PayRecurringRulePayload
  ) => Promise<PayRecurringRuleResponse>;
  deleteRecurringRule: (id: string) => Promise<void>;
  addDebtLoan: (payload: CreateDebtLoanPayload) => Promise<DebtLoan>;
  settleDebtLoan: (
    id: string,
    amountOrPayload?: number | SettleDebtLoanPayload
  ) => Promise<DebtLoan>;
  deleteDebtLoan: (id: string) => Promise<void>;
  addQuickPreset: (payload: CreateQuickPresetPayload) => Promise<QuickPreset>;
  deleteQuickPreset: (id: string) => Promise<void>;
  parseReceiptText: (text: string) => Promise<ReceiptParseResult>;
  exportMonthlyReport: (format: 'csv' | 'json') => Promise<void>;
}

const EMPTY_ACCOUNT_TOTALS: AccountTotals = {
  totalBalance: 0,
  sharedBalance: 0,
  personalBalance: 0,
};

function makeEmptyBudgetTotals(month: string): BudgetTotals {
  return {
    month,
    totalLimit: 0,
    totalSpent: 0,
    totalRemaining: 0,
  };
}

const INITIAL_QUICK_ENTRY: QuickEntryState = {
  visible: false,
  mode: 'create',
  editingTx: null,
  defaultType: 'expense',
  presetAmount: null,
  presetCategoryId: null,
};

const DuaSakuContext = createContext<DuaSakuContextValue | null>(null);

function getInitialMonth(): string {
  const saved = getStorageItem(MONTH_STORAGE_KEY);
  if (saved && isValidMonthKey(saved)) {
    return saved;
  }
  return getCurrentMonthKey();
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message;
  }
  return fallback;
}

export function DuaSakuProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const initialSession = useMemo(() => loadSession(), []);
  const initialMonth = useMemo(() => getInitialMonth(), []);

  const [token, setToken] = useState<string | null>(initialSession?.token ?? null);
  const [couple, setCouple] = useState<CoupleSpace | null>(initialSession?.couple ?? null);
  const [me, setMe] = useState<PartnerProfile | null>(initialSession?.partner ?? null);
  const [hydrating, setHydrating] = useState<boolean>(Boolean(initialSession));
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [selectedMonth, setSelectedMonthState] = useState<string>(initialMonth);

  const [categories, setCategories] = useState<CategoryGoal[]>([]);
  const [accounts, setAccounts] = useState<CoupleAccount[]>([]);
  const [accountTotals, setAccountTotals] = useState<AccountTotals>(EMPTY_ACCOUNT_TOTALS);
  const [transfers, setTransfers] = useState<AccountTransfer[]>([]);
  const [transactions, setTransactions] = useState<CoupleTransaction[]>([]);
  const [budgets, setBudgets] = useState<MonthlyBudget[]>([]);
  const [budgetTotals, setBudgetTotals] = useState<BudgetTotals>(() =>
    makeEmptyBudgetTotals(initialMonth)
  );
  const [summary, setSummary] = useState<CoupleSummary | null>(null);
  const [analytics, setAnalytics] = useState<MonthlyAnalytics | null>(null);
  const [notes, setNotes] = useState<SharedNote[]>([]);
  const [recurringRules, setRecurringRules] = useState<RecurringRule[]>([]);
  const [debtLoans, setDebtLoans] = useState<DebtLoan[]>([]);
  const [quickPresets, setQuickPresets] = useState<QuickPreset[]>([]);

  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [quickEntry, setQuickEntry] = useState<QuickEntryState>(INITIAL_QUICK_ENTRY);

  const syncSeqRef = useRef<number>(0);
  const meRef = useRef<PartnerProfile | null>(me);
  const recurringRulesRef = useRef<RecurringRule[]>(recurringRules);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackSeqRef = useRef<number>(0);
  const confirmBusyRef = useRef<boolean>(false);

  useEffect(() => {
    meRef.current = me;
  }, [me]);

  useEffect(() => {
    recurringRulesRef.current = recurringRules;
  }, [recurringRules]);

  const clearFeedbackTimer = useCallback(() => {
    if (feedbackTimerRef.current !== null) {
      clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
  }, []);

  const clearFeedback = useCallback(() => {
    clearFeedbackTimer();
    setFeedback(null);
  }, [clearFeedbackTimer]);

  const pushFeedback = useCallback(
    (kind: FeedbackKind, message: string, title?: string) => {
      clearFeedbackTimer();
      const id = ++feedbackSeqRef.current;
      setFeedback({ kind, message, title, id });
      if (kind !== 'error') {
        feedbackTimerRef.current = setTimeout(() => {
          setFeedback((prev) => (prev?.id === id ? null : prev));
        }, 4500);
      }
    },
    [clearFeedbackTimer]
  );

  const showError = useCallback(
    (message: string, title?: string) => {
      pushFeedback('error', message, title);
    },
    [pushFeedback]
  );

  const showSuccess = useCallback(
    (message: string, title?: string) => {
      pushFeedback('success', message, title);
    },
    [pushFeedback]
  );

  const showInfo = useCallback(
    (message: string, title?: string) => {
      pushFeedback('info', message, title);
    },
    [pushFeedback]
  );

  useEffect(() => {
    return () => {
      clearFeedbackTimer();
    };
  }, [clearFeedbackTimer]);

  const resetDomainState = useCallback((month: string) => {
    setCategories([]);
    setAccounts([]);
    setAccountTotals(EMPTY_ACCOUNT_TOTALS);
    setTransfers([]);
    setTransactions([]);
    setBudgets([]);
    setBudgetTotals(makeEmptyBudgetTotals(month));
    setSummary(null);
    setAnalytics(null);
    setNotes([]);
    setRecurringRules([]);
    setDebtLoans([]);
    setQuickPresets([]);
    setQuickEntry(INITIAL_QUICK_ENTRY);
  }, []);

  const setSelectedMonth = useCallback((month: string) => {
    if (!isValidMonthKey(month)) return;
    setSelectedMonthState(month);
    setStorageItem(MONTH_STORAGE_KEY, month);
  }, []);

  const syncAll = useCallback(
    async (authToken: string, month: string): Promise<void> => {
      const seq = ++syncSeqRef.current;
      const tzOffset = getLocalTzOffset();

      try {
        const [bootstrap, cats] = await Promise.all([
          duaSakuApi.getBootstrap(authToken, { month, tzOffset }),
          duaSakuApi.getCategories(authToken),
        ]);

        if (seq !== syncSeqRef.current) return;

        const cp = bootstrap.couple;
        setCouple(cp);
        const prevMe = meRef.current;
        if (prevMe) {
          const updated = cp.partners.find((p) => p.id === prevMe.id);
          const nextMe = updated ?? prevMe;
          saveSession(authToken, nextMe, cp);
          setMe(nextMe);
        }
        setCategories(cats);
        setAccounts(bootstrap.accounts);
        setAccountTotals(bootstrap.accountTotals);
        setTransfers(bootstrap.transfers);
        setTransactions(bootstrap.transactions);
        setBudgets(bootstrap.budgets);
        setBudgetTotals(bootstrap.budgetTotals);
        setSummary(bootstrap.summary);
        setAnalytics(bootstrap.analytics);
        setNotes(bootstrap.notes);
        setRecurringRules(bootstrap.recurringRules);
        setDebtLoans(bootstrap.debtLoans);
        setQuickPresets(bootstrap.quickPresets);
      } catch (err) {
        if (seq !== syncSeqRef.current) return;
        if (err instanceof ApiError && err.status === 401) {
          clearSession();
          setToken(null);
          setCouple(null);
          setMe(null);
          resetDomainState(month);
          showInfo('Sesi Anda telah berakhir. Silakan masuk atau buat ruang kembali.');
        }
        throw err;
      }
    },
    [resetDomainState, showInfo]
  );

  // Initial sync & month switch sync + 10s polling
  useEffect(() => {
    if (!token) {
      setHydrating(false);
      return;
    }

    let cancelled = false;
    syncAll(token, selectedMonth)
      .catch((err) => {
        if (cancelled) return;
        if (!(err instanceof ApiError && err.status === 401)) {
          showError(getErrorMessage(err, 'Gagal menyinkronkan data dengan server.'));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHydrating(false);
        }
      });

    const intervalId: ReturnType<typeof setInterval> = setInterval(() => {
      syncAll(token, selectedMonth).catch(() => undefined);
    }, 10_000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [token, selectedMonth, syncAll, showError]);

  const logout = useCallback(() => {
    syncSeqRef.current += 1;
    clearSession();
    setToken(null);
    setCouple(null);
    setMe(null);
    setActiveTab('dashboard');
    resetDomainState(selectedMonth);
    setConfirmState(null);
    clearFeedback();
  }, [clearFeedback, resetDomainState, selectedMonth]);

  const refreshAll = useCallback(async () => {
    if (!token) return;
    clearFeedback();
    setRefreshing(true);
    try {
      await syncAll(token, selectedMonth);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        showError(getErrorMessage(err, 'Gagal memuat ulang data.'));
      }
    } finally {
      setRefreshing(false);
    }
  }, [clearFeedback, selectedMonth, showError, syncAll, token]);

  const applyAuthSession = useCallback(
    async (res: AuthResponse, successMsg: string) => {
      const nextCouple = { ...res.couple, partners: [res.partner] };
      saveSession(res.token, res.partner, nextCouple);
      setCouple(nextCouple);
      setMe(res.partner);
      setToken(res.token);
      setActiveTab('dashboard');
      await syncAll(res.token, selectedMonth);
      showSuccess(successMsg);
    },
    [selectedMonth, showSuccess, syncAll]
  );

  const registerAccount = useCallback(
    async (payload: {
      email: string;
      password: string;
      partnerName: string;
      mode: 'create' | 'join';
      coupleName?: string;
      inviteCode?: string;
    }) => {
      setLoading(true);
      try {
        const res = await duaSakuApi.register({
          ...payload,
          email: payload.email.trim(),
          partnerName: payload.partnerName.trim(),
          coupleName: payload.coupleName?.trim(),
          inviteCode: payload.inviteCode?.trim().toUpperCase(),
        });
        await applyAuthSession(
          res,
          payload.mode === 'join'
            ? `Akun terdaftar & bergabung ke "${res.couple.coupleName}"!`
            : `Akun & ruang "${res.couple.coupleName}" berhasil dibuat!`
        );
      } catch (err) {
        showError(getErrorMessage(err, 'Gagal mendaftarkan akun.'), 'Gagal Daftar');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [applyAuthSession, showError]
  );

  const loginAccount = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      try {
        const res = await duaSakuApi.login(email.trim(), password);
        await applyAuthSession(res, `Selamat datang kembali, ${res.partner.name}!`);
      } catch (err) {
        showError(getErrorMessage(err, 'Email atau password salah.'), 'Gagal Masuk');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [applyAuthSession, showError]
  );

  const createCouple = useCallback(
    async (coupleName: string, partnerName: string) => {
      setLoading(true);
      try {
        const res = await duaSakuApi.createCouple(coupleName.trim(), partnerName.trim());
        await applyAuthSession(res, `Ruang "${res.couple.coupleName}" berhasil dibuat!`);
      } catch (err) {
        showError(getErrorMessage(err, 'Gagal membuat ruang pasangan.'), 'Gagal Masuk');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [applyAuthSession, showError]
  );

  const joinCouple = useCallback(
    async (inviteCode: string, partnerName: string) => {
      setLoading(true);
      try {
        const res = await duaSakuApi.joinCouple(
          inviteCode.trim().toUpperCase(),
          partnerName.trim()
        );
        await applyAuthSession(res, `Berhasil bergabung ke "${res.couple.coupleName}"!`);
      } catch (err) {
        showError(getErrorMessage(err, 'Gagal bergabung ke ruang pasangan.'), 'Gagal Masuk');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [applyAuthSession, showError]
  );

  const requireToken = useCallback((): string => {
    if (!token) {
      throw new Error('Sesi belum aktif. Silakan masuk terlebih dahulu.');
    }
    return token;
  }, [token]);

  const createTransaction = useCallback(
    async (payload: CreateTransactionPayload): Promise<CoupleTransaction> => {
      const authToken = requireToken();
      setLoading(true);
      try {
        const created = await duaSakuApi.createTransaction(authToken, payload);
        await syncAll(authToken, selectedMonth);
        showSuccess('Transaksi berhasil dicatat.');
        return created;
      } catch (err) {
        showError(getErrorMessage(err, 'Gagal mencatat transaksi.'), 'Gagal Simpan');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [requireToken, selectedMonth, showError, showSuccess, syncAll]
  );

  const updateTransaction = useCallback(
    async (id: string, payload: UpdateTransactionPayload): Promise<CoupleTransaction> => {
      const authToken = requireToken();
      setLoading(true);
      try {
        const updated = await duaSakuApi.updateTransaction(authToken, id, payload);
        await syncAll(authToken, selectedMonth);
        showSuccess('Transaksi berhasil diperbarui.');
        return updated;
      } catch (err) {
        showError(getErrorMessage(err, 'Gagal memperbarui transaksi.'), 'Gagal Simpan');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [requireToken, selectedMonth, showError, showSuccess, syncAll]
  );

  const deleteTransaction = useCallback(
    async (id: string): Promise<void> => {
      const authToken = requireToken();
      setLoading(true);
      try {
        await duaSakuApi.deleteTransaction(authToken, id);
        await syncAll(authToken, selectedMonth);
        showSuccess('Transaksi berhasil dihapus.');
      } catch (err) {
        showError(getErrorMessage(err, 'Gagal menghapus transaksi.'), 'Gagal Hapus');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [requireToken, selectedMonth, showError, showSuccess, syncAll]
  );

  const createAccount = useCallback(
    async (payload: CreateAccountPayload): Promise<CoupleAccount> => {
      const authToken = requireToken();
      setLoading(true);
      try {
        const created = await duaSakuApi.createAccount(authToken, payload);
        await syncAll(authToken, selectedMonth);
        showSuccess(`Akun "${created.name}" berhasil ditambahkan.`);
        return created;
      } catch (err) {
        showError(getErrorMessage(err, 'Gagal menambah akun.'), 'Gagal Simpan');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [requireToken, selectedMonth, showError, showSuccess, syncAll]
  );

  const updateAccount = useCallback(
    async (id: string, payload: UpdateAccountPayload): Promise<CoupleAccount> => {
      const authToken = requireToken();
      setLoading(true);
      try {
        const updated = await duaSakuApi.updateAccount(authToken, id, payload);
        await syncAll(authToken, selectedMonth);
        showSuccess(`Akun "${updated.name}" berhasil diperbarui.`);
        return updated;
      } catch (err) {
        showError(getErrorMessage(err, 'Gagal memperbarui akun.'), 'Gagal Simpan');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [requireToken, selectedMonth, showError, showSuccess, syncAll]
  );

  const deleteAccount = useCallback(
    async (id: string): Promise<void> => {
      const authToken = requireToken();
      setLoading(true);
      try {
        await duaSakuApi.deleteAccount(authToken, id);
        await syncAll(authToken, selectedMonth);
        showSuccess('Akun berhasil dihapus.');
      } catch (err) {
        showError(getErrorMessage(err, 'Gagal menghapus akun.'), 'Gagal Hapus');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [requireToken, selectedMonth, showError, showSuccess, syncAll]
  );

  const saveBudget = useCallback(
    async (payload: UpsertBudgetPayload): Promise<MonthlyBudget> => {
      const authToken = requireToken();
      setLoading(true);
      try {
        const saved = await duaSakuApi.saveBudget(authToken, payload);
        await syncAll(authToken, selectedMonth);
        showSuccess(`Anggaran "${saved.categoryName}" berhasil disimpan.`);
        return saved;
      } catch (err) {
        showError(getErrorMessage(err, 'Gagal menyimpan anggaran.'), 'Gagal Simpan');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [requireToken, selectedMonth, showError, showSuccess, syncAll]
  );

  const updateBudget = useCallback(
    async (id: string, payload: UpdateBudgetPayload): Promise<MonthlyBudget> => {
      const authToken = requireToken();
      setLoading(true);
      try {
        const updated = await duaSakuApi.updateBudget(authToken, id, payload);
        await syncAll(authToken, selectedMonth);
        showSuccess(`Anggaran "${updated.categoryName}" berhasil diperbarui.`);
        return updated;
      } catch (err) {
        showError(getErrorMessage(err, 'Gagal memperbarui anggaran.'), 'Gagal Simpan');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [requireToken, selectedMonth, showError, showSuccess, syncAll]
  );

  const deleteBudget = useCallback(
    async (id: string): Promise<void> => {
      const authToken = requireToken();
      setLoading(true);
      try {
        await duaSakuApi.deleteBudget(authToken, id);
        await syncAll(authToken, selectedMonth);
        showSuccess('Anggaran bulanan berhasil dihapus.');
      } catch (err) {
        showError(getErrorMessage(err, 'Gagal menghapus anggaran.'), 'Gagal Hapus');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [requireToken, selectedMonth, showError, showSuccess, syncAll]
  );

  const createCategory = useCallback(
    async (payload: CreateCategoryPayload): Promise<CategoryGoal> => {
      const authToken = requireToken();
      setLoading(true);
      try {
        const created = await duaSakuApi.createCategory(authToken, payload);
        await syncAll(authToken, selectedMonth);
        showSuccess(`Pos "${created.name}" berhasil ditambahkan.`);
        return created;
      } catch (err) {
        showError(getErrorMessage(err, 'Gagal menambah pos keuangan.'), 'Gagal Simpan');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [requireToken, selectedMonth, showError, showSuccess, syncAll]
  );

  const updateCategory = useCallback(
    async (id: string, payload: UpdateCategoryPayload): Promise<CategoryGoal> => {
      const authToken = requireToken();
      setLoading(true);
      try {
        const updated = await duaSakuApi.updateCategory(authToken, id, payload);
        await syncAll(authToken, selectedMonth);
        showSuccess(`Pos "${updated.name}" berhasil diperbarui.`);
        return updated;
      } catch (err) {
        showError(getErrorMessage(err, 'Gagal memperbarui pos keuangan.'), 'Gagal Simpan');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [requireToken, selectedMonth, showError, showSuccess, syncAll]
  );

  const deleteCategory = useCallback(
    async (id: string): Promise<void> => {
      const authToken = requireToken();
      setLoading(true);
      try {
        await duaSakuApi.deleteCategory(authToken, id);
        await syncAll(authToken, selectedMonth);
        showSuccess('Pos keuangan berhasil dihapus.');
      } catch (err) {
        showError(getErrorMessage(err, 'Gagal menghapus pos keuangan.'), 'Gagal Hapus');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [requireToken, selectedMonth, showError, showSuccess, syncAll]
  );

  const transferAccounts = useCallback(
    async (payload: TransferAccountPayload): Promise<TransferAccountResponse> => {
      const authToken = requireToken();
      setLoading(true);
      try {
        const res = await duaSakuApi.transferAccounts(authToken, payload);
        await syncAll(authToken, selectedMonth);
        showSuccess('Transfer antar dompet berhasil dicatat.');
        return res;
      } catch (err) {
        showError(getErrorMessage(err, 'Gagal melakukan transfer antar dompet.'), 'Gagal Transfer');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [requireToken, selectedMonth, showError, showSuccess, syncAll]
  );

  const createNote = useCallback(
    async (payload: CreateNotePayload): Promise<SharedNote> => {
      const authToken = requireToken();
      setLoading(true);
      try {
        const created = await duaSakuApi.createNote(authToken, payload);
        await syncAll(authToken, selectedMonth);
        showSuccess('Catatan bersama berhasil disimpan.');
        return created;
      } catch (err) {
        showError(getErrorMessage(err, 'Gagal menyimpan catatan.'), 'Gagal Simpan');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [requireToken, selectedMonth, showError, showSuccess, syncAll]
  );

  const updateNote = useCallback(
    async (id: string, payload: UpdateNotePayload): Promise<SharedNote> => {
      const authToken = requireToken();
      setLoading(true);
      try {
        const updated = await duaSakuApi.updateNote(authToken, id, payload);
        await syncAll(authToken, selectedMonth);
        showSuccess('Catatan bersama berhasil diperbarui.');
        return updated;
      } catch (err) {
        showError(getErrorMessage(err, 'Gagal memperbarui catatan.'), 'Gagal Simpan');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [requireToken, selectedMonth, showError, showSuccess, syncAll]
  );

  const deleteNote = useCallback(
    async (id: string): Promise<void> => {
      const authToken = requireToken();
      setLoading(true);
      try {
        await duaSakuApi.deleteNote(authToken, id);
        await syncAll(authToken, selectedMonth);
        showSuccess('Catatan bersama berhasil dihapus.');
      } catch (err) {
        showError(getErrorMessage(err, 'Gagal menghapus catatan.'), 'Gagal Hapus');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [requireToken, selectedMonth, showError, showSuccess, syncAll]
  );

  const updateCoupleProfile = useCallback(
    async (payload: UpdateCouplePayload): Promise<UpdateCoupleResponse> => {
      const authToken = requireToken();
      setLoading(true);
      try {
        const updated = await duaSakuApi.updateCouple(authToken, payload);
        saveSession(authToken, updated.partner, updated.couple);
        setCouple(updated.couple);
        setMe(updated.partner);
        await syncAll(authToken, selectedMonth);
        showSuccess('Profil ruang pasangan berhasil diperbarui.');
        return updated;
      } catch (err) {
        showError(getErrorMessage(err, 'Gagal memperbarui profil ruang pasangan.'), 'Gagal Simpan');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [requireToken, selectedMonth, showError, showSuccess, syncAll]
  );

  const exportMonthlyReport = useCallback(
    async (format: 'csv' | 'json'): Promise<void> => {
      const authToken = requireToken();
      const tzOffset = getLocalTzOffset();
      setLoading(true);
      try {
        if (format === 'csv') {
          const csv = await duaSakuApi.exportMonthlyCsv(authToken, {
            month: selectedMonth,
            tzOffset,
          });
          await triggerExportDownload(
            `duasaku-${selectedMonth}.csv`,
            csv,
            'text/csv;charset=utf-8'
          );
          showSuccess(`Laporan CSV bulan ${selectedMonth} berhasil diekspor.`);
        } else {
          const jsonReport = await duaSakuApi.exportMonthlyJson(authToken, {
            month: selectedMonth,
            tzOffset,
          });
          await triggerExportDownload(
            `duasaku-${selectedMonth}.json`,
            JSON.stringify(jsonReport, null, 2),
            'application/json;charset=utf-8'
          );
          showSuccess(`Laporan JSON bulan ${selectedMonth} berhasil diekspor.`);
        }
      } catch (err) {
        showError(getErrorMessage(err, 'Gagal mengekspor laporan bulanan.'), 'Gagal Ekspor');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [requireToken, selectedMonth, showError, showSuccess]
  );

  const runMutation = useCallback(
    async <T,>(
      fn: (authToken: string) => Promise<T>,
      successMsg: string | ((result: T) => string),
      errorFallback: string,
      errorTitle = 'Gagal Simpan'
    ): Promise<T> => {
      const authToken = requireToken();
      setLoading(true);
      try {
        const result = await fn(authToken);
        await syncAll(authToken, selectedMonth);
        showSuccess(typeof successMsg === 'function' ? successMsg(result) : successMsg);
        return result;
      } catch (err) {
        showError(getErrorMessage(err, errorFallback), errorTitle);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [requireToken, selectedMonth, showError, showSuccess, syncAll]
  );

  const addRecurringRule = useCallback(
    (payload: CreateRecurringRulePayload): Promise<RecurringRule> =>
      runMutation(
        (authToken) => duaSakuApi.createRecurringRule(authToken, payload),
        (rule) => `Tagihan rutin "${rule.title}" berhasil ditambahkan.`,
        'Gagal menambahkan tagihan rutin.'
      ),
    [runMutation]
  );

  const updateRecurringRule = useCallback(
    (id: string, payload: UpdateRecurringRulePayload): Promise<RecurringRule> =>
      runMutation(
        (authToken) => duaSakuApi.updateRecurringRule(authToken, id, payload),
        (rule) => `Tagihan rutin "${rule.title}" berhasil diperbarui.`,
        'Gagal memperbarui tagihan rutin.'
      ),
    [runMutation]
  );

  const toggleRecurringRule = useCallback(
    (id: string, active?: boolean): Promise<RecurringRule> => {
      const current = recurringRulesRef.current.find((r) => r.id === id);
      const nextActive = active !== undefined ? active : current ? !current.active : true;
      return runMutation(
        (authToken) => duaSakuApi.updateRecurringRule(authToken, id, { active: nextActive }),
        (rule) =>
          rule.active
            ? `Tagihan rutin "${rule.title}" diaktifkan.`
            : `Tagihan rutin "${rule.title}" dijeda.`,
        'Gagal mengubah status tagihan rutin.'
      );
    },
    [runMutation]
  );

  const payRecurringRule = useCallback(
    (id: string, payload: PayRecurringRulePayload = {}): Promise<PayRecurringRuleResponse> =>
      runMutation(
        (authToken) => duaSakuApi.payRecurringRule(authToken, id, payload),
        (res) => `Tagihan "${res.rule.title}" dicatat & jadwal dimajukan.`,
        'Gagal membayar tagihan rutin.'
      ),
    [runMutation]
  );

  const deleteRecurringRule = useCallback(
    async (id: string): Promise<void> => {
      await runMutation(
        (authToken) => duaSakuApi.deleteRecurringRule(authToken, id),
        'Tagihan rutin berhasil dihapus.',
        'Gagal menghapus tagihan rutin.',
        'Gagal Hapus'
      );
    },
    [runMutation]
  );

  const addDebtLoan = useCallback(
    (payload: CreateDebtLoanPayload): Promise<DebtLoan> =>
      runMutation(
        (authToken) => duaSakuApi.createDebt(authToken, payload),
        (debt) => `Catatan ${debt.direction === 'payable' ? 'hutang' : 'piutang'} "${debt.personName}" disimpan.`,
        'Gagal menyimpan catatan hutang/piutang.'
      ),
    [runMutation]
  );

  const settleDebtLoan = useCallback(
    (id: string, amountOrPayload?: number | SettleDebtLoanPayload): Promise<DebtLoan> => {
      const payload: SettleDebtLoanPayload =
        typeof amountOrPayload === 'number'
          ? { amount: amountOrPayload }
          : amountOrPayload ?? {};
      return runMutation(
        (authToken) => duaSakuApi.settleDebt(authToken, id, payload),
        (debt) =>
          debt.settled
            ? `Catatan "${debt.personName}" telah lunas.`
            : `Pembayaran sebagian untuk "${debt.personName}" dicatat.`,
        'Gagal mencatat pembayaran hutang/piutang.'
      );
    },
    [runMutation]
  );

  const deleteDebtLoan = useCallback(
    async (id: string): Promise<void> => {
      await runMutation(
        (authToken) => duaSakuApi.deleteDebt(authToken, id),
        'Catatan hutang/piutang berhasil dihapus.',
        'Gagal menghapus catatan hutang/piutang.',
        'Gagal Hapus'
      );
    },
    [runMutation]
  );

  const addQuickPreset = useCallback(
    (payload: CreateQuickPresetPayload): Promise<QuickPreset> =>
      runMutation(
        (authToken) => duaSakuApi.createPreset(authToken, payload),
        (preset) => `Preset cepat "${preset.label}" ditambahkan.`,
        'Gagal menambahkan preset cepat.'
      ),
    [runMutation]
  );

  const deleteQuickPreset = useCallback(
    async (id: string): Promise<void> => {
      await runMutation(
        (authToken) => duaSakuApi.deletePreset(authToken, id),
        'Preset cepat berhasil dihapus.',
        'Gagal menghapus preset cepat.',
        'Gagal Hapus'
      );
    },
    [runMutation]
  );

  const parseReceiptText = useCallback(
    async (text: string): Promise<ReceiptParseResult> => {
      const authToken = requireToken();
      try {
        return await duaSakuApi.parseReceipt(authToken, text);
      } catch (err) {
        showError(getErrorMessage(err, 'Gagal membaca teks struk.'), 'Gagal Baca Struk');
        throw err;
      }
    },
    [requireToken, showError]
  );

  const requestConfirm = useCallback((req: ConfirmRequest) => {
    setConfirmState({
      ...req,
      visible: true,
      loading: false,
    });
  }, []);

  const closeConfirm = useCallback(() => {
    setConfirmState((prev) => (prev?.loading ? prev : null));
  }, []);

  const executeConfirm = useCallback(async () => {
    if (!confirmState || confirmState.loading || confirmBusyRef.current) return;
    confirmBusyRef.current = true;
    const action = confirmState.onConfirm;
    setConfirmState((prev) => (prev ? { ...prev, loading: true } : null));
    try {
      await action();
      setConfirmState(null);
    } catch {
      setConfirmState(null);
    } finally {
      confirmBusyRef.current = false;
    }
  }, [confirmState]);

  const openNewTransaction = useCallback(
    (
      defaultType: TransactionType = 'expense',
      presetAmount?: number,
      presetCategoryId?: string
    ) => {
      setQuickEntry({
        visible: true,
        mode: 'create',
        editingTx: null,
        defaultType,
        presetAmount: presetAmount ?? null,
        presetCategoryId: presetCategoryId ?? null,
      });
    },
    []
  );

  const openEditTransaction = useCallback((tx: CoupleTransaction) => {
    setQuickEntry({
      visible: true,
      mode: 'edit',
      editingTx: tx,
      defaultType: tx.type,
      presetAmount: tx.amount,
      presetCategoryId: tx.categoryId,
    });
  }, []);

  const closeQuickEntry = useCallback(() => {
    setQuickEntry(INITIAL_QUICK_ENTRY);
  }, []);

  const value = useMemo<DuaSakuContextValue>(
    () => ({
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
      categories,
      accounts,
      accountTotals,
      transfers,
      transactions,
      budgets,
      budgetTotals,
      summary,
      analytics,
      notes,
      recurringRules,
      debtLoans,
      quickPresets,
      feedback,
      showError,
      showSuccess,
      showInfo,
      clearFeedback,
      confirmState,
      requestConfirm,
      closeConfirm,
      executeConfirm,
      quickEntry,
      quickEntryOpen: quickEntry.visible,
      openNewTransaction,
      openEditTransaction,
      closeQuickEntry,
      registerAccount,
      loginAccount,
      createCouple,
      joinCouple,
      updateCoupleProfile,
      logout,
      refreshAll,
      createTransaction,
      updateTransaction,
      deleteTransaction,
      createAccount,
      updateAccount,
      deleteAccount,
      transferAccounts,
      saveBudget,
      updateBudget,
      deleteBudget,
      createCategory,
      updateCategory,
      deleteCategory,
      createNote,
      updateNote,
      deleteNote,
      addRecurringRule,
      toggleRecurringRule,
      updateRecurringRule,
      payRecurringRule,
      deleteRecurringRule,
      addDebtLoan,
      settleDebtLoan,
      deleteDebtLoan,
      addQuickPreset,
      deleteQuickPreset,
      parseReceiptText,
      exportMonthlyReport,
    }),
    [
      token,
      couple,
      me,
      hydrating,
      loading,
      refreshing,
      activeTab,
      selectedMonth,
      setSelectedMonth,
      categories,
      accounts,
      accountTotals,
      transfers,
      transactions,
      budgets,
      budgetTotals,
      summary,
      analytics,
      notes,
      recurringRules,
      debtLoans,
      quickPresets,
      feedback,
      showError,
      showSuccess,
      showInfo,
      clearFeedback,
      confirmState,
      requestConfirm,
      closeConfirm,
      executeConfirm,
      quickEntry,
      openNewTransaction,
      openEditTransaction,
      closeQuickEntry,
      registerAccount,
      loginAccount,
      createCouple,
      joinCouple,
      updateCoupleProfile,
      logout,
      refreshAll,
      createTransaction,
      updateTransaction,
      deleteTransaction,
      createAccount,
      updateAccount,
      deleteAccount,
      transferAccounts,
      saveBudget,
      updateBudget,
      deleteBudget,
      createCategory,
      updateCategory,
      deleteCategory,
      createNote,
      updateNote,
      deleteNote,
      addRecurringRule,
      toggleRecurringRule,
      updateRecurringRule,
      payRecurringRule,
      deleteRecurringRule,
      addDebtLoan,
      settleDebtLoan,
      deleteDebtLoan,
      addQuickPreset,
      deleteQuickPreset,
      parseReceiptText,
      exportMonthlyReport,
    ]
  );

  return <DuaSakuContext.Provider value={value}>{children}</DuaSakuContext.Provider>;
}

export function useDuaSaku(): DuaSakuContextValue {
  const ctx = useContext(DuaSakuContext);
  if (!ctx) {
    throw new Error('useDuaSaku harus digunakan di dalam DuaSakuProvider.');
  }
  return ctx;
}
