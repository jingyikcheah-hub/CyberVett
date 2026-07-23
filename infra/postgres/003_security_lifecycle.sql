alter table interview_sessions
  add column if not exists invite_expires_at timestamptz,
  add column if not exists invite_revoked_at timestamptz,
  add column if not exists invite_consumed_at timestamptz,
  add column if not exists resume_token_digest char(64),
  add column if not exists resume_expires_at timestamptz,
  add column if not exists evaluation_started_at timestamptz;

do $migration$
begin
  if exists (
    select 1
    from interview_sessions
    where status = 'in_progress'
      and resume_token_digest is null
  ) then
    raise exception 'Upgrade paused: legacy in-progress interviews have no resumable credential. Keep the prior release running until they finish, then rerun the migration.';
  end if;
end
$migration$;

update interview_sessions
set invite_expires_at = created_at + interval '7 days'
where invite_expires_at is null;

alter table interview_sessions
  alter column invite_expires_at set default (current_timestamp + interval '7 days'),
  alter column invite_expires_at set not null;

alter table interview_answers
  add column if not exists answer_revision integer not null default 1,
  add column if not exists follow_up_pending boolean not null default false;

alter table interview_sessions
  drop constraint if exists interview_sessions_status_check;

alter table interview_sessions
  add constraint interview_sessions_status_check
  check (status in ('invited', 'in_progress', 'completed', 'review', 'shortlisted', 'declined', 'revoked'));

alter table interview_sessions
  drop constraint if exists interview_sessions_invite_expiry_check;

alter table interview_sessions
  add constraint interview_sessions_invite_expiry_check
  check (invite_expires_at >= created_at);

alter table interview_sessions
  drop constraint if exists interview_sessions_resume_token_check;

alter table interview_sessions
  add constraint interview_sessions_resume_token_check
  check (
    (resume_token_digest is null and resume_expires_at is null)
    or
    (resume_token_digest is not null and resume_expires_at is not null)
  );

alter table interview_answers
  drop constraint if exists interview_answers_answer_revision_check;

alter table interview_answers
  add constraint interview_answers_answer_revision_check
  check (answer_revision > 0);

do $migration$
begin
  if exists (
    select 1
    from users
    group by lower(email)
    having count(*) > 1
  ) then
    raise exception 'Cannot enforce case-insensitive email uniqueness because duplicate normalized addresses exist.';
  end if;
end
$migration$;

create unique index if not exists users_email_lower_unique_idx
  on users (lower(email));

create index if not exists sessions_job_idx
  on interview_sessions (job_id);

create unique index if not exists sessions_resume_token_digest_unique_idx
  on interview_sessions (resume_token_digest)
  where resume_token_digest is not null;

update interview_reports
set payload = jsonb_set(payload, '{assessmentStatus}', '"available"'::jsonb, true),
    updated_at = current_timestamp
where not (payload ? 'assessmentStatus');
