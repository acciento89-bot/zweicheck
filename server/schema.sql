CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS email_tokens (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('verify', 'reset')),
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_tokens_user_purpose_idx ON email_tokens(user_id, purpose);

CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_email text,
  code_hash char(64) NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'revoked')),
  expires_at timestamptz NOT NULL,
  accepted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invitations_creator_idx ON invitations(created_by, status);
CREATE INDEX IF NOT EXISTS invitations_email_idx ON invitations(invited_email, status);

CREATE TABLE IF NOT EXISTS trust_connections (
  id uuid PRIMARY KEY,
  user_a_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  user_b_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CHECK (user_a_id <> user_b_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS trust_connections_active_pair_idx
  ON trust_connections (LEAST(user_a_id::text, user_b_id::text), GREATEST(user_a_id::text, user_b_id::text))
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS trust_connections_user_a_idx ON trust_connections(user_a_id, revoked_at);
CREATE INDEX IF NOT EXISTS trust_connections_user_b_idx ON trust_connections(user_b_id, revoked_at);

CREATE TABLE IF NOT EXISTS check_requests (
  id uuid PRIMARY KEY,
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewer_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  category text NOT NULL CHECK (category IN ('message', 'payment', 'link', 'data')),
  description text NOT NULL,
  amount_cents bigint,
  urgency text NOT NULL CHECK (urgency IN ('none', 'low', 'high', 'very_high')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'closed')),
  recommendation text CHECK (recommendation IN ('do_not_act', 'verify_personally', 'plausible', 'call_me')),
  response_note text,
  responded_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requester_id <> reviewer_id)
);
CREATE INDEX IF NOT EXISTS check_requests_requester_idx ON check_requests(requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS check_requests_reviewer_idx ON check_requests(reviewer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS attachments (
  id uuid PRIMARY KEY,
  check_id uuid NOT NULL REFERENCES check_requests(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  original_name text NOT NULL,
  stored_name text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attachments_check_idx ON attachments(check_id);
