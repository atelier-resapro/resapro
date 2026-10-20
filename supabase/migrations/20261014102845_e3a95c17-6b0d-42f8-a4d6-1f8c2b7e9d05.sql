-- Booking: the only way for the public to create an appointment.
-- Validates the phone number (French format), normalises it to 0612345678,
-- creates or finds the client by phone, then inserts the appointment.

create or replace function public.reserver(
  p_nom text,
  p_telephone text,
  p_prestation_id uuid,
  p_creneau_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nom text := btrim(coalesce(p_nom, ''));
  v_tel text := regexp_replace(coalesce(p_telephone, ''), '[\s.-]', '', 'g');
  v_creneau public.creneaux%rowtype;
  v_client_id uuid;
  v_rdv_id uuid;
begin
  -- Name
  if char_length(v_nom) < 2 or char_length(v_nom) > 80 then
    raise exception 'Merci d''indiquer votre nom (2 caractères minimum).';
  end if;

  -- Phone: 06 12 34 56 78, 0612345678, +33612345678, 0033612345678 -> 0612345678
  if v_tel ~ '^\+33[1-9][0-9]{8}$' then
    v_tel := '0' || substr(v_tel, 4);
  elsif v_tel ~ '^0033[1-9][0-9]{8}$' then
    v_tel := '0' || substr(v_tel, 5);
  end if;
  if v_tel !~ '^0[1-9][0-9]{8}$' then
    raise exception 'Numéro de téléphone invalide. Exemple : 06 12 34 56 78.';
  end if;

  -- Service must exist and be active
  if not exists (
    select 1 from public.prestations where id = p_prestation_id and active
  ) then
    raise exception 'Cette prestation n''est plus proposée.';
  end if;

  -- Slot must exist, be open and not be in the past
  select * into v_creneau from public.creneaux where id = p_creneau_id;
  if not found or not v_creneau.ouvert then
    raise exception 'Ce créneau n''est plus disponible. Choisissez-en un autre.';
  end if;
  if (v_creneau.date + v_creneau.heure_debut) <= (now() at time zone 'Europe/Paris') then
    raise exception 'Ce créneau est déjà passé. Choisissez-en un autre.';
  end if;

  -- Client: created or found by phone, name updated
  insert into public.clients (nom, telephone)
  values (v_nom, v_tel)
  on conflict (telephone) do update set nom = excluded.nom
  returning id into v_client_id;

  -- Appointment: the partial unique index refuses a second confirmed
  -- appointment on the same slot, even at the same second.
  begin
    insert into public.rendez_vous (client_id, prestation_id, creneau_id)
    values (v_client_id, p_prestation_id, p_creneau_id)
    returning id into v_rdv_id;
  exception
    when unique_violation then
      raise exception 'Ce créneau vient d''être réservé. Choisissez-en un autre.';
  end;

  return v_rdv_id;
end;
$$;

revoke all on function public.reserver(text, text, uuid, uuid) from public;
grant execute on function public.reserver(text, text, uuid, uuid) to anon, authenticated;
