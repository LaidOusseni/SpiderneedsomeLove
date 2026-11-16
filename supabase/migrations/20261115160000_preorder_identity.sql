-- Add the identity fields collected by the preorder interest form.
-- Existing registrations remain intact; their new fields are left NULL.
alter table public.preorder_registrations
  add column if not exists last_name text,
  add column if not exists instagram_handle text;

comment on column public.preorder_registrations.last_name is
  'Nom fourni lors de la manifestation d’intérêt ; accès administration uniquement.';
comment on column public.preorder_registrations.instagram_handle is
  'Identifiant Instagram facultatif ; accès administration uniquement.';

create or replace function public.register_preorder_with_identity(
  p_drop_slug text,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_instagram text,
  p_sizes jsonb,
  p_consent boolean,
  p_website text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last_name text := left(regexp_replace(btrim(coalesce(p_last_name, '')), '\s+', ' ', 'g'), 60);
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_instagram text := lower(btrim(coalesce(p_instagram, '')));
  v_result jsonb;
begin
  if char_length(v_last_name) not between 1 and 60 then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;
  if v_instagram <> ''
     and (v_instagram !~ '^[a-z0-9._]{1,30}$'
       or v_instagram like '.%'
       or v_instagram like '%.'
       or v_instagram like '%..%') then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;

  v_result := public.register_preorder(
    p_drop_slug,
    p_first_name,
    v_email,
    p_sizes,
    p_consent,
    p_website
  );
  if coalesce(v_result ->> 'ok', 'false') <> 'true' then
    return v_result;
  end if;

  update public.preorder_registrations r
  set last_name = v_last_name,
      instagram_handle = nullif(v_instagram, '')
  from public.drops d
  where d.id = r.drop_id
    and d.slug = p_drop_slug
    and r.email = v_email;

  if not found then
    raise exception 'Inscription de précommande introuvable après enregistrement.';
  end if;

  return v_result;
end
$$;

revoke all on function public.register_preorder(text, text, text, jsonb, boolean, text) from anon, authenticated;
revoke all on function public.register_preorder_with_identity(text, text, text, text, text, jsonb, boolean, text)
  from public;
grant execute on function public.register_preorder_with_identity(text, text, text, text, text, jsonb, boolean, text)
  to anon, authenticated;
