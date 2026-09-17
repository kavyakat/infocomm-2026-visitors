alter table lucky_draw_eligible_snapshot
  add column if not exists manually_added boolean not null default false,
  add column if not exists excluded boolean not null default false;
