import { Platform } from 'react-native';
import type {
  AccountsResponse,
  AuthResponse,
  BudgetsResponse,
  CategoryGoal,
  CoupleAccount,
  CoupleSpace,
  CoupleSummary,
  CoupleTransaction,
  CreateAccountPayload,
  CreateCategoryPayload,
  CreateNotePayload,
  CreateTransactionPayload,
  DeleteResponse,
  HealthResponse,
  MonthlyAnalytics,
  MonthlyBudget,
  SharedNote,
  TransactionFilterParams,
  UpdateAccountPayload,
  UpdateBudgetPayload,
  UpdateTransactionPayload,
  UpsertBudgetPayload,
} from '../types';

const PRIVATE_LAN_RE =
  /^(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}|.*\.local)$/i;

function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '::1' ||
    h === '[::1]' ||
    h === '0.0.0.0'
  );
}

export function getApiUrl(): string {
  const rawEnv = (process.env.EXPO_PUBLIC_API_URL || '').trim().replace(/\/+$/, '');

  if (Platform.OS === 'web') {
    const win = typeof window !== 'undefined' ? window : undefined;
    const pageHost = win?.location?.hostname || '';
    const pageProto = win?.location?.protocol || 'http:';

    if (pageHost && isLoopbackHost(pageHost)) {
      const localHost = pageHost === '127.0.0.1' ? '127.0.0.1' : 'localhost';
      if (!rawEnv) return `http://${localHost}:4100`;
      try {
        const parsed = new URL(rawEnv);
        if (isLoopbackHost(parsed.hostname)) return rawEnv;
        if (PRIVATE_LAN_RE.test(parsed.hostname)) {
          const port = parsed.port || '4100';
          return `${parsed.protocol}//${localHost}:${port}`;
        }
        return rawEnv;
      } catch {
        return `http://${localHost}:4100`;
      }
    }

    if (rawEnv) return rawEnv;
    if (pageHost) return `${pageProto}//${pageHost}:4100`;
    return 'http://localhost:4100';
  }

  if (rawEnv) return rawEnv;
  return Platform.OS === 'android' ? 'http://10.0.2.2:4100' : 'http://localhost:4100';
}

export const API_URL = getApiUrl();

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const defaultTzOffset = (): number => -new Date().getTimezoneOffset() || 0;

function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return pairs.length > 0 ? `?${pairs.join('&')}` : '';
}

async function request<T>(
  path: string,
  options: { token?: string; method?: string; body?: unknown; timeoutMs?: number } = {}
): Promise<T> {
  const baseUrl = getApiUrl();
  const hasAbort = typeof AbortController !== 'undefined';
  const controller = hasAbort ? new AbortController() : undefined;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const timer = controller
    ? setTimeout(() => {
        controller.abort();
      }, timeoutMs)
    : undefined;

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller?.signal,
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      throw new ApiError(res.status, data.error || `HTTP ${res.status}`);
    }
    return data as T;
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError(408, 'Permintaan ke server melebihi batas waktu.');
    }
    throw new ApiError(
      0,
      err instanceof Error ? err.message : 'Gagal terhubung ke server DuaSaku.'
    );
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export const duaSakuApi = {
  getHealth: () => request<HealthResponse>('/api/health'),

  createCouple: (coupleName: string, partnerName: string) =>
    request<AuthResponse>('/api/couples/create', {
      method: 'POST',
      body: { coupleName, partnerName },
    }),

  joinCouple: (inviteCode: string, partnerName: string) =>
    request<AuthResponse>('/api/couples/join', {
      method: 'POST',
      body: { inviteCode, partnerName },
    }),

  getCouple: (token: string) => request<CoupleSpace>('/api/couple', { token }),

  getCategories: (token: string) => request<CategoryGoal[]>('/api/categories', { token }),

  createCategory: (token: string, payload: CreateCategoryPayload) =>
    request<CategoryGoal>('/api/categories', { token, method: 'POST', body: payload }),

  getAccounts: (token: string) => request<AccountsResponse>('/api/accounts', { token }),

  createAccount: async (token: string, payload: CreateAccountPayload): Promise<CoupleAccount> => {
    const res = await request<{ account: CoupleAccount }>('/api/accounts', {
      token,
      method: 'POST',
      body: payload,
    });
    return res.account;
  },

  updateAccount: async (
    token: string,
    id: string,
    payload: UpdateAccountPayload
  ): Promise<CoupleAccount> => {
    const res = await request<{ account: CoupleAccount }>(`/api/accounts/${id}`, {
      token,
      method: 'PATCH',
      body: payload,
    });
    return res.account;
  },

  deleteAccount: (token: string, id: string) =>
    request<DeleteResponse>(`/api/accounts/${id}`, { token, method: 'DELETE' }),

  getTransactions: async (
    token: string,
    params: TransactionFilterParams = {}
  ): Promise<CoupleTransaction[]> => {
    const tzOffset =
      params.tzOffset !== undefined
        ? params.tzOffset
        : params.month
          ? defaultTzOffset()
          : undefined;
    const query = buildQuery({
      month: params.month,
      tzOffset,
      partnerId: params.partnerId,
      categoryId: params.categoryId,
      type: params.type,
      accountId: params.accountId,
    });
    const res = await request<{ transactions: CoupleTransaction[] }>(
      `/api/transactions${query}`,
      { token }
    );
    return res.transactions;
  },

  createTransaction: async (
    token: string,
    payload: CreateTransactionPayload
  ): Promise<CoupleTransaction> => {
    const res = await request<{ transaction: CoupleTransaction }>('/api/transactions', {
      token,
      method: 'POST',
      body: payload,
    });
    return res.transaction;
  },

  updateTransaction: async (
    token: string,
    id: string,
    payload: UpdateTransactionPayload
  ): Promise<CoupleTransaction> => {
    const res = await request<{ transaction: CoupleTransaction }>(`/api/transactions/${id}`, {
      token,
      method: 'PATCH',
      body: payload,
    });
    return res.transaction;
  },

  deleteTransaction: (token: string, id: string) =>
    request<DeleteResponse>(`/api/transactions/${id}`, { token, method: 'DELETE' }),

  getBudgets: (token: string, params: { month?: string; tzOffset?: number } = {}) => {
    const query = buildQuery({
      month: params.month,
      tzOffset: params.tzOffset ?? defaultTzOffset(),
    });
    return request<BudgetsResponse>(`/api/budgets${query}`, { token });
  },

  saveBudget: async (token: string, payload: UpsertBudgetPayload): Promise<MonthlyBudget> => {
    const res = await request<{ budget: MonthlyBudget }>('/api/budgets', {
      token,
      method: 'PUT',
      body: {
        ...payload,
        tzOffset: payload.tzOffset ?? defaultTzOffset(),
      },
    });
    return res.budget;
  },

  updateBudget: async (
    token: string,
    id: string,
    payload: UpdateBudgetPayload
  ): Promise<MonthlyBudget> => {
    const res = await request<{ budget: MonthlyBudget }>(`/api/budgets/${id}`, {
      token,
      method: 'PATCH',
      body: {
        ...payload,
        tzOffset: payload.tzOffset ?? defaultTzOffset(),
      },
    });
    return res.budget;
  },

  deleteBudget: (token: string, id: string) =>
    request<DeleteResponse>(`/api/budgets/${id}`, { token, method: 'DELETE' }),

  getNotes: (token: string) => request<SharedNote[]>('/api/notes', { token }),

  createNote: (token: string, payload: CreateNotePayload) =>
    request<SharedNote>('/api/notes', { token, method: 'POST', body: payload }),

  getSummary: (token: string, params: { month?: string; tzOffset?: number } = {}) => {
    const tzOffset =
      params.tzOffset !== undefined
        ? params.tzOffset
        : params.month
          ? defaultTzOffset()
          : undefined;
    const query = buildQuery({
      month: params.month,
      tzOffset,
    });
    return request<CoupleSummary>(`/api/summary${query}`, { token });
  },

  getAnalytics: (token: string, params: { month?: string; tzOffset?: number } = {}) => {
    const query = buildQuery({
      month: params.month,
      tzOffset: params.tzOffset ?? defaultTzOffset(),
    });
    return request<MonthlyAnalytics>(`/api/analytics${query}`, { token });
  },
};
