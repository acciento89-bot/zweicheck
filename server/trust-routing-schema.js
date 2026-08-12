const db = require('./db');

let ready = false;

async function ensureTrustRoutingSchema() {
  if (ready) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS user_presence (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      status text NOT NULL CHECK (status IN ('available', 'urgent_only', 'unavailable')),
      expires_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE check_requests
      ADD COLUMN IF NOT EXISTS fallback_reviewer_id uuid REFERENCES users(id) ON DELETE SET NULL;

    ALTER TABLE check_requests
      ADD COLUMN IF NOT EXISTS reassigned_at timestamptz;

    CREATE INDEX IF NOT EXISTS check_requests_fallback_reviewer_idx
      ON check_requests(fallback_reviewer_id)
      WHERE fallback_reviewer_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS check_reassignments (
      id bigserial PRIMARY KEY,
      check_id uuid NOT NULL REFERENCES check_requests(id) ON DELETE CASCADE,
      from_reviewer_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      to_reviewer_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      changed_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (check_id),
      CHECK (from_reviewer_id <> to_reviewer_id)
    );
    CREATE INDEX IF NOT EXISTS check_reassignments_check_idx ON check_reassignments(check_id);

    ALTER TABLE push_notifications
      DROP CONSTRAINT IF EXISTS push_notifications_event_type_check;
    ALTER TABLE push_notifications
      ADD CONSTRAINT push_notifications_event_type_check
      CHECK (event_type IN ('check_created', 'check_answered', 'check_rerouted'));
  `);

  ready = true;
}

module.exports = { ensureTrustRoutingSchema };
