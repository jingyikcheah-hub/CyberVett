alter table users
  add column if not exists account_mode varchar(20);

update users set account_mode = 'trainer' where account_mode is null;

alter table users
  alter column account_mode set not null;

alter table interview_answers
  add column if not exists follow_up_prompt text,
  add column if not exists follow_up_answer text;

alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
  check (role in ('admin', 'recruiter', 'reviewer', 'trainee'));

alter table users drop constraint if exists users_account_mode_check;
alter table users add constraint users_account_mode_check
  check (account_mode in ('trainer', 'trainee'));
