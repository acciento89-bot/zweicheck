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

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS push_worker_state (
  id boolean PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
  activated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS push_notifications (
  id bigserial PRIMARY KEY,
  check_id uuid NOT NULL REFERENCES check_requests(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('check_created', 'check_answered')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (check_id, event_type)
);
CREATE INDEX IF NOT EXISTS push_notifications_due_idx
  ON push_notifications(status, next_attempt_at, created_at);

CREATE TABLE IF NOT EXISTS activities (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'check_created',
    'check_answered',
    'check_closed',
    'invitation_received',
    'invitation_accepted',
    'invitation_declined',
    'connection_revoked'
  )),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  check_id uuid REFERENCES check_requests(id) ON DELETE SET NULL,
  invitation_id uuid REFERENCES invitations(id) ON DELETE SET NULL,
  connection_id uuid REFERENCES trust_connections(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  read_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activities_user_feed_idx
  ON activities(user_id, id DESC)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS activities_user_unread_idx
  ON activities(user_id, id DESC)
  WHERE archived_at IS NULL AND read_at IS NULL;

CREATE OR REPLACE FUNCTION zc_add_activity(
  p_user_id uuid,
  p_event_type text,
  p_actor_user_id uuid,
  p_check_id uuid,
  p_invitation_id uuid,
  p_connection_id uuid,
  p_title text,
  p_body text,
  p_dedupe_key text
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO activities (
    user_id,
    event_type,
    actor_user_id,
    check_id,
    invitation_id,
    connection_id,
    title,
    body,
    dedupe_key
  ) VALUES (
    p_user_id,
    p_event_type,
    p_actor_user_id,
    p_check_id,
    p_invitation_id,
    p_connection_id,
    p_title,
    p_body,
    p_dedupe_key
  )
  ON CONFLICT (dedupe_key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION zc_activity_check_created()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  actor_name text;
BEGIN
  SELECT name INTO actor_name FROM users WHERE id = NEW.requester_id;
  PERFORM zc_add_activity(
    NEW.reviewer_id,
    'check_created',
    NEW.requester_id,
    NEW.id,
    NULL,
    NULL,
    'Neue Prüfanfrage',
    COALESCE(actor_name, 'Eine Vertrauensperson') || ' bittet dich um einen zweiten Blick.',
    'check:' || NEW.id::text || ':created'
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION zc_activity_check_changed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  reviewer_name text;
  requester_name text;
BEGIN
  IF OLD.responded_at IS NULL AND NEW.responded_at IS NOT NULL THEN
    SELECT name INTO reviewer_name FROM users WHERE id = NEW.reviewer_id;
    PERFORM zc_add_activity(
      NEW.requester_id,
      'check_answered',
      NEW.reviewer_id,
      NEW.id,
      NULL,
      NULL,
      'Antwort auf deine Prüfanfrage',
      COALESCE(reviewer_name, 'Deine Vertrauensperson') || ' hat dir eine Rückmeldung gegeben.',
      'check:' || NEW.id::text || ':answered'
    );
  END IF;

  IF OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL THEN
    SELECT name INTO requester_name FROM users WHERE id = NEW.requester_id;
    PERFORM zc_add_activity(
      NEW.reviewer_id,
      'check_closed',
      NEW.requester_id,
      NEW.id,
      NULL,
      NULL,
      'Prüfung abgeschlossen',
      COALESCE(requester_name, 'Die anfragende Person') || ' hat den Vorgang abgeschlossen.',
      'check:' || NEW.id::text || ':closed'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION zc_activity_invitation_created()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_user_id uuid;
  actor_name text;
BEGIN
  IF NEW.invited_email IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO target_user_id
  FROM users
  WHERE email = lower(trim(NEW.invited_email))
  LIMIT 1;

  SELECT name INTO actor_name FROM users WHERE id = NEW.created_by;

  IF target_user_id IS NOT NULL AND target_user_id <> NEW.created_by THEN
    PERFORM zc_add_activity(
      target_user_id,
      'invitation_received',
      NEW.created_by,
      NULL,
      NEW.id,
      NULL,
      'Neue Einladung',
      COALESCE(actor_name, 'Jemand') || ' möchte dich als Vertrauensperson verbinden.',
      'invitation:' || NEW.id::text || ':received:' || target_user_id::text
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION zc_activity_user_registered()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  invitation_row record;
  actor_name text;
BEGIN
  FOR invitation_row IN
    SELECT i.*
    FROM invitations i
    WHERE i.status = 'pending'
      AND i.expires_at > now()
      AND i.invited_email = NEW.email
      AND i.created_by <> NEW.id
  LOOP
    SELECT name INTO actor_name FROM users WHERE id = invitation_row.created_by;
    PERFORM zc_add_activity(
      NEW.id,
      'invitation_received',
      invitation_row.created_by,
      NULL,
      invitation_row.id,
      NULL,
      'Neue Einladung',
      COALESCE(actor_name, 'Jemand') || ' möchte dich als Vertrauensperson verbinden.',
      'invitation:' || invitation_row.id::text || ':received:' || NEW.id::text
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION zc_activity_invitation_changed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  actor_name text;
  declined_user_id uuid;
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    SELECT name INTO actor_name FROM users WHERE id = NEW.accepted_by;
    PERFORM zc_add_activity(
      NEW.created_by,
      'invitation_accepted',
      NEW.accepted_by,
      NULL,
      NEW.id,
      NULL,
      'Einladung angenommen',
      COALESCE(actor_name, 'Die eingeladene Person') || ' gehört jetzt zu deinem Vertrauenskreis.',
      'invitation:' || NEW.id::text || ':accepted'
    );
  ELSIF OLD.status = 'pending' AND NEW.status = 'declined' THEN
    SELECT id INTO declined_user_id
    FROM users
    WHERE email = NEW.invited_email
    LIMIT 1;
    SELECT name INTO actor_name FROM users WHERE id = declined_user_id;
    PERFORM zc_add_activity(
      NEW.created_by,
      'invitation_declined',
      declined_user_id,
      NULL,
      NEW.id,
      NULL,
      'Einladung abgelehnt',
      COALESCE(actor_name, 'Die eingeladene Person') || ' hat die Einladung nicht angenommen.',
      'invitation:' || NEW.id::text || ':declined'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION zc_activity_connection_revoked()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
    PERFORM zc_add_activity(
      NEW.user_a_id,
      'connection_revoked',
      NULL,
      NULL,
      NULL,
      NEW.id,
      'Verbindung beendet',
      'Eine Vertrauensverbindung wurde beendet.',
      'connection:' || NEW.id::text || ':revoked:' || NEW.user_a_id::text
    );
    PERFORM zc_add_activity(
      NEW.user_b_id,
      'connection_revoked',
      NULL,
      NULL,
      NULL,
      NEW.id,
      'Verbindung beendet',
      'Eine Vertrauensverbindung wurde beendet.',
      'connection:' || NEW.id::text || ':revoked:' || NEW.user_b_id::text
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zc_activity_check_created_trigger ON check_requests;
CREATE TRIGGER zc_activity_check_created_trigger
AFTER INSERT ON check_requests
FOR EACH ROW EXECUTE FUNCTION zc_activity_check_created();

DROP TRIGGER IF EXISTS zc_activity_check_changed_trigger ON check_requests;
CREATE TRIGGER zc_activity_check_changed_trigger
AFTER UPDATE OF responded_at, closed_at ON check_requests
FOR EACH ROW EXECUTE FUNCTION zc_activity_check_changed();

DROP TRIGGER IF EXISTS zc_activity_invitation_created_trigger ON invitations;
CREATE TRIGGER zc_activity_invitation_created_trigger
AFTER INSERT ON invitations
FOR EACH ROW EXECUTE FUNCTION zc_activity_invitation_created();

DROP TRIGGER IF EXISTS zc_activity_user_registered_trigger ON users;
CREATE TRIGGER zc_activity_user_registered_trigger
AFTER INSERT ON users
FOR EACH ROW EXECUTE FUNCTION zc_activity_user_registered();

DROP TRIGGER IF EXISTS zc_activity_invitation_changed_trigger ON invitations;
CREATE TRIGGER zc_activity_invitation_changed_trigger
AFTER UPDATE OF status ON invitations
FOR EACH ROW EXECUTE FUNCTION zc_activity_invitation_changed();

DROP TRIGGER IF EXISTS zc_activity_connection_revoked_trigger ON trust_connections;
CREATE TRIGGER zc_activity_connection_revoked_trigger
AFTER UPDATE OF revoked_at ON trust_connections
FOR EACH ROW EXECUTE FUNCTION zc_activity_connection_revoked();
