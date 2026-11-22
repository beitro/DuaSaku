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
