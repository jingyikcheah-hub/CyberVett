create table organizations (
  id uuid primary key,
  name varchar(160) not null,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  name varchar(120) not null,
  email varchar(254) not null unique,
  role varchar(20) not null check (role in ('admin', 'recruiter', 'reviewer', 'trainee')),
  account_mode varchar(20) not null check (account_mode in ('trainer', 'trainee')),
  password_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table jobs (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  title varchar(120) not null,
  department varchar(100) not null,
  location varchar(120) not null,
  status varchar(20) not null check (status in ('draft', 'active', 'closed')),
  duration_minutes smallint not null check (duration_minutes between 10 and 120),
  questions jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table interview_sessions (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  candidate_name varchar(120),
  candidate_email varchar(254),
  invite_token_digest char(64) not null unique,
  status varchar(20) not null check (status in ('invited', 'in_progress', 'completed', 'review', 'shortlisted', 'declined')),
  score smallint check (score between 0 and 100),
  consented_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  reviewer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table interview_answers (
  id uuid primary key,
  session_id uuid not null references interview_sessions(id) on delete cascade,
  question_id varchar(80) not null,
  answer text not null,
  follow_up_prompt text,
  follow_up_answer text,
  submitted_at timestamptz not null default now(),
  unique (session_id, question_id)
);

create table interview_reports (
  id uuid primary key,
  session_id uuid not null unique references interview_sessions(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table audit_events (
  id bigserial primary key,
  organization_id uuid references organizations(id) on delete set null,
  actor_id uuid references users(id) on delete set null,
  action varchar(100) not null,
  entity_type varchar(60) not null,
  entity_id varchar(100),
  request_id varchar(100),
  created_at timestamptz not null default now()
);

create index jobs_organization_idx on jobs (organization_id, created_at desc);
create index sessions_organization_idx on interview_sessions (organization_id, created_at desc);
create index sessions_status_idx on interview_sessions (organization_id, status);
create index reports_organization_idx on interview_reports (organization_id, created_at desc);
