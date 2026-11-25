export type TransactionType = 'income' | 'expense';

export type AccountType = 'cash' | 'bank' | 'ewallet' | 'shared_savings' | 'other';

export type PartnerRoleLabel = 'Partner A' | 'Partner B';

export type TabKey =
  | 'dashboard'
  | 'transactions'
  | 'analytics'
  | 'accounts'
  | 'budgets'
  | 'categories'
  | 'notes';

export interface PartnerProfile {
  id: string;
  coupleId: string;
  name: string;
  roleLabel: PartnerRoleLabel;
  avatarColor: string;
}

export interface CoupleInfo {
  id: string;
  coupleName: string;
  inviteCode: string;
}

export interface CoupleSpace extends CoupleInfo {
  partners: PartnerProfile[];
}

export interface AuthResponse {
  token: string;
  couple: CoupleInfo;
  partner: PartnerProfile;
}

export interface UpdateCouplePayload {
  coupleName?: string;
  partnerName?: string;
}

export interface UpdateCoupleResponse {
  couple: CoupleSpace;
  partner: PartnerProfile;
}

export interface CategoryGoal {
  id: string;
  coupleId: string;
  name: string;
  icon: string;
  color: string;
  targetAmount: number;
  isDefault: boolean;
}

export interface CreateCategoryPayload {
  name: string;
  icon?: string;
  color?: string;
  targetAmount?: number;
}

export interface UpdateCategoryPayload {
  name?: string;
  icon?: string;
  color?: string;
  targetAmount?: number;
}

export interface CoupleAccount {
  id: string;
  coupleId: string;
  ownerPartnerId: string | null;
  ownerPartnerName: string | null;
  name: string;
  accountType: AccountType;
  isShared: boolean;
  initialBalance: number;
  balance: number;
  icon: string;
  color: string;
  createdAt: string;
}

export interface AccountTotals {
  totalBalance: number;
  sharedBalance: number;
  personalBalance: number;
}

export interface AccountsResponse {
  accounts: CoupleAccount[];
  totals: AccountTotals;
}

export interface CreateAccountPayload {
  name: string;
  accountType?: AccountType;
  isShared?: boolean;
  ownerPartnerId?: string | null;
  initialBalance?: number;
  icon?: string;
  color?: string;
}

export interface UpdateAccountPayload {
  name?: string;
  accountType?: AccountType;
  isShared?: boolean;
  ownerPartnerId?: string | null;
  initialBalance?: number;
  icon?: string;
  color?: string;
}

export interface AccountTransfer {
  id: string;
  coupleId: string;
  partnerId: string;
  partnerName: string;
  fromAccountId: string | null;
  fromAccountName: string | null;
  fromAccountIcon: string | null;
  toAccountId: string | null;
  toAccountName: string | null;
  toAccountIcon: string | null;
  amount: number;
  note: string;
  occurredAt: string;
  createdAt: string;
}

export interface TransferAccountPayload {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  note?: string;
  occurredAt?: string;
  date?: string;
}

export interface TransferAccountResponse {
  transfer: AccountTransfer;
  fromAccount: CoupleAccount;
  toAccount: CoupleAccount;
  totals: AccountTotals;
}

export interface CoupleTransaction {
  id: string;
  coupleId: string;
  partnerId: string;
  partnerName: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  accountId: string | null;
  accountName: string | null;
  accountIcon: string | null;
  type: TransactionType;
  amount: number;
  note: string;
  occurredAt: string;
}

export interface TransactionFilterParams {
  month?: string;
  tzOffset?: number;
  partnerId?: string;
  categoryId?: string;
  type?: TransactionType;
  accountId?: string;
}

export interface CreateTransactionPayload {
  categoryId: string;
  type: TransactionType;
  amount: number;
  note?: string;
  occurredAt?: string;
  accountId?: string | null;
}

export interface UpdateTransactionPayload {
  categoryId?: string;
  type?: TransactionType;
  amount?: number;
  note?: string;
  occurredAt?: string;
  accountId?: string | null;
}

export interface MonthlyBudget {
  id: string;
  coupleId: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  month: string;
  limitAmount: number;
  spent: number;
  remaining: number;
  progressPercent: number;
  isOverBudget: boolean;
}

export interface BudgetsResponse {
  month: string;
  totalLimit: number;
  totalSpent: number;
  totalRemaining: number;
  budgets: MonthlyBudget[];
}

export interface UpsertBudgetPayload {
  categoryId: string;
  month: string;
  limitAmount: number;
  tzOffset?: number;
}

export interface UpdateBudgetPayload {
  limitAmount: number;
  tzOffset?: number;
}

export interface SharedNote {
  id: string;
  coupleId: string;
  authorPartnerId: string;
  authorName: string;
  categoryId: string | null;
  title: string;
  content: string;
  isPinned: boolean;
  updatedAt: string;
}

export interface CreateNotePayload {
  title: string;
  content?: string;
  categoryId?: string | null;
  isPinned?: boolean;
}

export interface UpdateNotePayload {
  title?: string;
  content?: string;
  categoryId?: string | null;
  isPinned?: boolean;
}

export interface SummaryPartnerItem {
  partnerId: string;
  partnerName: string;
  income: number;
  expense: number;
  net: number;
}

export interface SummaryCategoryItem {
  categoryId: string;
  categoryName: string;
  icon: string;
  color: string;
  targetAmount: number;
  spent: number;
  income: number;
}

export interface CoupleSummary {
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
  byPartner: SummaryPartnerItem[];
  byCategory: SummaryCategoryItem[];
  month?: string;
}

export interface AnalyticsTotals {
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
  savingsRate: number;
  transactionCount: number;
}

export interface AnalyticsCategoryItem {
  categoryId: string;
  categoryName: string;
  icon: string;
  color: string;
  targetAmount: number;
  spent: number;
  expense: number;
  income: number;
  transactionCount: number;
  expensePercent: number;
  incomePercent: number;
}

export interface AnalyticsPartnerItem {
  partnerId: string;
  partnerName: string;
  roleLabel: PartnerRoleLabel;
  avatarColor: string;
  income: number;
  expense: number;
  net: number;
  transactionCount: number;
  incomePercent: number;
  expensePercent: number;
}

export interface AccountsOverview extends AccountTotals {
  accountsCount: number;
}

export interface MonthlyAnalytics {
  month: string;
  totals: AnalyticsTotals;
  byCategory: AnalyticsCategoryItem[];
  byPartner: AnalyticsPartnerItem[];
  accountsOverview: AccountsOverview;
}

export interface DeleteResponse {
  ok: boolean;
  id: string;
}

export interface HealthResponse {
  ok: boolean;
  app: string;
  storage: 'postgresql' | 'memory';
}

export interface MonthlyExportJson {
  exportedAt: string;
  month: string;
  tzOffset: number;
  couple: CoupleSpace;
  summary: {
    month: string;
    totalIncome: number;
    totalExpense: number;
    netBalance: number;
  };
  analytics: {
    month: string;
    totals: AnalyticsTotals;
    accountsOverview: AccountsOverview;
  };
  budgets: MonthlyBudget[];
  transactions: CoupleTransaction[];
  transfers: AccountTransfer[];
}

export type RecurringFrequency = 'weekly' | 'monthly' | 'yearly';

export interface RecurringRule {
  id: string;
  coupleId: string;
  title: string;
  type: TransactionType;
  amount: number;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  accountId: string | null;
  accountName: string | null;
  accountIcon: string | null;
  frequency: RecurringFrequency;
  nextDueDate: string;
  active: boolean;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export interface CreateRecurringRulePayload {
  title: string;
  type: TransactionType;
  amount: number;
  categoryId: string;
  accountId?: string | null;
  frequency: RecurringFrequency;
  nextDueDate?: string;
  active?: boolean;
}

export interface UpdateRecurringRulePayload {
  title?: string;
  type?: TransactionType;
  amount?: number;
  categoryId?: string;
  accountId?: string | null;
  frequency?: RecurringFrequency;
  nextDueDate?: string;
  active?: boolean;
}

export interface PayRecurringRulePayload {
  date?: string;
  occurredAt?: string;
  accountId?: string | null;
  amount?: number;
  note?: string;
}

export interface PayRecurringRuleResponse {
  transaction: CoupleTransaction;
  rule: RecurringRule;
}

export type DebtDirection = 'payable' | 'receivable';

export interface DebtLoan {
  id: string;
  coupleId: string;
  personName: string;
  direction: DebtDirection;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  note: string;
  dueDate: string | null;
  settled: boolean;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export interface CreateDebtLoanPayload {
  personName: string;
  direction: DebtDirection;
  amount: number;
  note?: string;
  dueDate?: string | null;
}

export interface SettleDebtLoanPayload {
  amount?: number;
}

export interface QuickPreset {
  id: string;
  coupleId: string;
  label: string;
  type: TransactionType;
  amount: number;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  accountId: string | null;
  accountName: string | null;
  accountIcon: string | null;
  note: string;
  createdAt: string;
}

export interface CreateQuickPresetPayload {
  label: string;
  type: TransactionType;
  amount: number;
  categoryId?: string | null;
  accountId?: string | null;
  note?: string;
}

export interface ReceiptParseResult {
  amount: number | null;
  merchant: string | null;
  suggestedCategoryId: string | null;
  suggestedCategoryName: string | null;
  suggestedType: TransactionType;
}

export interface BootstrapPayload {
  month: string;
  couple: CoupleSpace;
  categories: CategoryGoal[];
  accounts: CoupleAccount[];
  accountTotals: AccountTotals;
  transfers: AccountTransfer[];
  transactions: CoupleTransaction[];
  budgets: MonthlyBudget[];
  budgetTotals: {
    month: string;
    totalLimit: number;
    totalSpent: number;
    totalRemaining: number;
  };
  summary: CoupleSummary;
  analytics: MonthlyAnalytics;
  notes: SharedNote[];
  recurringRules: RecurringRule[];
  debtLoans: DebtLoan[];
  quickPresets: QuickPreset[];
}
