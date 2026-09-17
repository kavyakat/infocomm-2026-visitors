create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  email text not null unique,
  mobile text not null,
  role text not null check (role in ('visitor', 'organizer')),
  created_at timestamptz default now()
);

create table exhibitors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  booth_number text not null,
  hall text not null,
  pin text not null unique check (pin ~ '^\d{4}$'),
  created_at timestamptz default now()
);

create table visits (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references profiles(id) on delete cascade,
  exhibitor_id uuid not null references exhibitors(id) on delete cascade,
  visited_at timestamptz not null default now(),
  day smallint not null check (day in (1, 2, 3)),
  rating smallint check (rating between 1 and 5),
  unique (visitor_id, exhibitor_id)
);

create table lucky_draw_winners (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references profiles(id) on delete cascade,
  prize_rank smallint not null,
  drawn_at timestamptz default now()
);
