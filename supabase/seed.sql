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
