CREATE TABLE IF NOT EXISTS couples (
  id UUID PRIMARY KEY,
  couple_name TEXT NOT NULL,
  invite_code VARCHAR(12) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partners (
  id UUID PRIMARY KEY,
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role_label VARCHAR(20) NOT NULL CHECK (role_label IN ('Partner A', 'Partner B')),
  avatar_color VARCHAR(20) NOT NULL DEFAULT '#10B981',
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY,
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon VARCHAR(16) NOT NULL DEFAULT '💰',
  color VARCHAR(20) NOT NULL DEFAULT '#10B981',
  target_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY,
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  note TEXT NOT NULL DEFAULT '',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shared_notes (
  id UUID PRIMARY KEY,
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  author_partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY,
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  owner_partner_id UUID REFERENCES partners(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  account_type VARCHAR(24) NOT NULL CHECK (account_type IN ('cash', 'bank', 'ewallet', 'shared_savings', 'other')),
  is_shared BOOLEAN NOT NULL DEFAULT false,
  initial_balance NUMERIC(15, 2) NOT NULL DEFAULT 0,
  balance NUMERIC(15, 2) NOT NULL DEFAULT 0,
  icon VARCHAR(16) NOT NULL DEFAULT '💳',
  color VARCHAR(20) NOT NULL DEFAULT '#5F8563',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounts_couple_id
  ON accounts(couple_id);

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_couple_occurred
  ON transactions(couple_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_couple_account
  ON transactions(couple_id, account_id);

CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY,
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  month VARCHAR(7) NOT NULL CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  limit_amount NUMERIC(15, 2) NOT NULL CHECK (limit_amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (couple_id, category_id, month)
);

CREATE INDEX IF NOT EXISTS idx_budgets_couple_month
  ON budgets(couple_id, month);

CREATE TABLE IF NOT EXISTS account_transfers (
  id UUID PRIMARY KEY,
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  from_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  to_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  note TEXT NOT NULL DEFAULT '',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_transfers_couple_occurred
  ON account_transfers(couple_id, occurred_at DESC);

ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_partners_email_lower
  ON partners(LOWER(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS recurring_rules (
  id UUID PRIMARY KEY,
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  frequency VARCHAR(16) NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
  next_due_date VARCHAR(10) NOT NULL CHECK (next_due_date ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$'),
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recurring_rules_couple_due
  ON recurring_rules(couple_id, next_due_date ASC);

CREATE TABLE IF NOT EXISTS debt_loans (
  id UUID PRIMARY KEY,
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  person_name TEXT NOT NULL,
  direction VARCHAR(16) NOT NULL CHECK (direction IN ('payable', 'receivable')),
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  paid_amount NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  note TEXT NOT NULL DEFAULT '',
  due_date VARCHAR(10) CHECK (due_date IS NULL OR due_date ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$'),
  settled BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_debt_loans_couple_settled
  ON debt_loans(couple_id, settled ASC, created_at DESC);

CREATE TABLE IF NOT EXISTS quick_presets (
  id UUID PRIMARY KEY,
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quick_presets_couple_created
  ON quick_presets(couple_id, created_at ASC);

CREATE TABLE IF NOT EXISTS email_otps (
  email TEXT NOT NULL,
  purpose VARCHAR(24) NOT NULL CHECK (purpose IN ('register', 'reset_password')),
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (email, purpose)
);
