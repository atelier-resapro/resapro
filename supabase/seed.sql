-- Demo data for RésaPro (loaded by `supabase db push --include-seed`).
-- No user account is created here: the manager account is created by hand.

-- Services
insert into public.prestations (nom, duree_minutes, prix)
select v.nom, v.duree_minutes, v.prix
from (values
  ('Coupe femme', 45, 35.00),
  ('Coupe homme', 30, 22.00),
  ('Couleur', 90, 60.00),
  ('Barbe', 20, 15.00)
) as v (nom, duree_minutes, prix)
where not exists (select 1 from public.prestations p where p.nom = v.nom);

-- Slots: Tuesday to Saturday, every 30 minutes from 9:00 to 17:30,
-- for the 8 weeks starting today (valid whatever the day it is loaded).
insert into public.creneaux (date, heure_debut)
select d::date, t::time
from generate_series(current_date, current_date + 55, interval '1 day') as d
cross join generate_series(
  timestamp '2000-01-01 09:00',
  timestamp '2000-01-01 17:30',
  interval '30 minutes'
) as t
where extract(dow from d) in (2, 3, 4, 5, 6)
on conflict (date, heure_debut) do nothing;

-- Fictional clients (phone numbers in the fictional range 06 39 98 xx xx)
insert into public.clients (nom, telephone) values
  ('Camille Martin', '0639980101'),
  ('Julien Bernard', '0639980102'),
  ('Sophie Lefèvre', '0639980103'),
  ('Thomas Moreau', '0639980104'),
  ('Émilie Garnier', '0639980105'),
  ('Nicolas Petit', '0639980106')
on conflict (telephone) do nothing;

-- Fictional appointments on the first three open days from today
-- (jour_n = 1 is the first open day, 2 the next one, ...).
with jours as (
  select date, row_number() over (order by date) as n
  from (select distinct date from public.creneaux where date >= current_date) d
)
insert into public.rendez_vous (client_id, prestation_id, creneau_id, statut)
select cl.id, pr.id, cr.id, v.statut
from (values
  (1, '10:00', '0639980101', 'Coupe femme', 'confirme'),
  (1, '11:30', '0639980102', 'Coupe homme', 'confirme'),
  (1, '14:00', '0639980103', 'Couleur',     'confirme'),
  (2, '09:30', '0639980104', 'Barbe',       'confirme'),
  (2, '15:00', '0639980105', 'Coupe femme', 'confirme'),
  (3, '10:30', '0639980106', 'Coupe homme', 'confirme'),
  (3, '16:00', '0639980101', 'Coupe femme', 'annule')
) as v (jour_n, heure, tel, prestation, statut)
join jours j on j.n = v.jour_n
join public.creneaux cr on cr.date = j.date and cr.heure_debut = v.heure::time
join public.clients cl on cl.telephone = v.tel
join public.prestations pr on pr.nom = v.prestation
where not exists (select 1 from public.rendez_vous r where r.creneau_id = cr.id);
