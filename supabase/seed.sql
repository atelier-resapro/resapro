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
