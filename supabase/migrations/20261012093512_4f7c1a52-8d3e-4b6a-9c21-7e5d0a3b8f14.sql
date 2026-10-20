-- Initial schema: clients, prestations, creneaux, rendez_vous

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  telephone text not null unique,
  cree_le timestamptz default now()
);

create table public.prestations (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  duree_minutes int not null check (duree_minutes > 0),
  prix numeric(8,2) not null check (prix >= 0),
  active boolean not null default true,
  cree_le timestamptz default now()
);

create table public.creneaux (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  heure_debut time not null,
  ouvert boolean not null default true,
  unique (date, heure_debut)
);

create table public.rendez_vous (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  prestation_id uuid not null references public.prestations(id),
  creneau_id uuid not null references public.creneaux(id),
  statut text not null default 'confirme' check (statut in ('confirme', 'annule')),
  cree_le timestamptz default now()
);

-- One confirmed appointment per slot, even if two people book at the same second.
create unique index rendez_vous_un_confirme_par_creneau
  on public.rendez_vous (creneau_id)
  where statut = 'confirme';

create index rendez_vous_client_id_idx on public.rendez_vous (client_id);
create index rendez_vous_prestation_id_idx on public.rendez_vous (prestation_id);

-- Row Level Security
alter table public.clients enable row level security;
alter table public.prestations enable row level security;
alter table public.creneaux enable row level security;
alter table public.rendez_vous enable row level security;

-- Public (anon): can only read the active services.
create policy "Le public lit les prestations actives"
  on public.prestations for select
  to anon
  using (active = true);

-- Signed-in user = the manager (sign-ups are disabled): full access.
create policy "Le gerant gere les prestations"
  on public.prestations for all
  to authenticated
  using (true) with check (true);

create policy "Le gerant gere les creneaux"
  on public.creneaux for all
  to authenticated
  using (true) with check (true);

create policy "Le gerant gere les clients"
  on public.clients for all
  to authenticated
  using (true) with check (true);

create policy "Le gerant gere les rendez-vous"
  on public.rendez_vous for all
  to authenticated
  using (true) with check (true);
