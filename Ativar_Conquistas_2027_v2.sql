-- CONQUISTAS 2027 · Zayan e Léo · v2 sem limite semanal de fotos
-- Abra SQL Editor > New query no projeto Conquistas 2027.
-- Cole este arquivo inteiro e clique em Run.
-- No resultado final aparecerão dois códigos de convite, um para cada perfil.
-- Guarde os códigos. Eles não ficam no código público do site.
-- Pode executar novamente: as metas, as fotos e os convites existentes são preservados.

begin;

create schema if not exists conquista_private;
revoke all on schema conquista_private from public, anon, authenticated;

create table if not exists conquista_private.invites (
  person text primary key check (person in ('zayan', 'leo')),
  code uuid not null default gen_random_uuid(),
  claimed_by uuid unique references auth.users(id) on delete set null
);
revoke all on conquista_private.invites from public, anon, authenticated;
insert into conquista_private.invites(person) values ('zayan'), ('leo')
on conflict (person) do nothing;

create table if not exists public.conquista_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  person text not null unique check (person in ('zayan', 'leo')),
  created_at timestamptz not null default now()
);

create table if not exists public.conquista_goals (
  goal text not null check (goal in ('training', 'business', 'pc', 'cnh', 'celebrate')),
  person text not null check (person in ('zayan', 'leo', 'both')),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed')),
  notes text not null default '' check (length(notes) <= 3000),
  updated_at timestamptz not null default now(),
  primary key (goal, person),
  check ((goal in ('business', 'celebrate') and person = 'both') or
         (goal in ('training', 'pc', 'cnh') and person in ('zayan', 'leo'))),
  check (goal not in ('training', 'celebrate') or status in ('pending', 'completed'))
);

insert into public.conquista_goals(goal, person) values
  ('training','zayan'), ('training','leo'),
  ('business','both'),
  ('pc','zayan'), ('pc','leo'),
  ('cnh','zayan'), ('cnh','leo'),
  ('celebrate','both')
on conflict (goal, person) do nothing;

create table if not exists public.conquista_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.conquista_members(user_id) on delete cascade,
  captured_on date not null,
  week_start date generated always as
    (captured_on - (extract(isodow from captured_on)::integer - 1)) stored,
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  check (captured_on <= (now() at time zone 'America/Sao_Paulo')::date)
);

-- Atualiza também uma instalação da v1, sem apagar dados ou arquivos.
-- Remove a trava semanal e a antiga associação entre caminho e semana.
do $$
declare item record;
begin
  for item in select conname from pg_constraint
    where conrelid = 'public.conquista_photos'::regclass
      and ((contype = 'u' and pg_get_constraintdef(oid) like '%week_start%')
        or (contype = 'c' and pg_get_constraintdef(oid) like '%storage_path%'))
  loop
    execute format('alter table public.conquista_photos drop constraint %I', item.conname);
  end loop;
end;
$$;

-- Novas fotos usam um identificador único. Os caminhos da v1 continuam válidos.
-- A data pode ser corrigida pelo dono sem renomear o arquivo.
alter table public.conquista_photos add constraint conquista_photo_storage_owner check (
  storage_path = user_id::text || '/' || id::text || '.jpg'
  or storage_path ~ ('^' || user_id::text || '/[0-9]{4}-[0-9]{2}-[0-9]{2}[.]jpg$')
);

-- Estas funções só consultam os dois membros cadastrados, sem permitir alterações.
create or replace function public.conquista_is_member()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.conquista_members where user_id = auth.uid()); $$;

create or replace function public.conquista_my_person()
returns text language sql stable security definer set search_path = ''
as $$ select person from public.conquista_members where user_id = auth.uid(); $$;

-- O convite é verificado no servidor. Um perfil pode pertencer a uma única conta.
create or replace function public.conquista_join(chosen_person text, invite_code text)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  selected_invite conquista_private.invites%rowtype;
  current_person text;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta primeiro.'; end if;
  select person into current_person from public.conquista_members where user_id = auth.uid();
  if current_person is not null then
    if current_person = chosen_person then return current_person; end if;
    raise exception 'Sua conta já está vinculada a outro perfil.';
  end if;
  select * into selected_invite from conquista_private.invites
    where person = chosen_person and code::text = trim(invite_code) for update;
  if not found then raise exception 'Convite inválido. Confira o perfil e o código.'; end if;
  if selected_invite.claimed_by is not null then
    raise exception 'Este perfil já tem uma conta vinculada.';
  end if;
  insert into public.conquista_members(user_id, person) values (auth.uid(), chosen_person);
  update conquista_private.invites set claimed_by = auth.uid() where person = chosen_person;
  return chosen_person;
end;
$$;

create or replace function conquista_private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists conquista_goal_updated on public.conquista_goals;
create trigger conquista_goal_updated before update on public.conquista_goals
for each row execute function conquista_private.set_updated_at();

revoke all on function public.conquista_is_member() from public, anon;
revoke all on function public.conquista_my_person() from public, anon;
revoke all on function public.conquista_join(text,text) from public, anon;
grant execute on function public.conquista_is_member() to authenticated;
grant execute on function public.conquista_my_person() to authenticated;
grant execute on function public.conquista_join(text,text) to authenticated;
revoke all on function conquista_private.set_updated_at() from public, anon, authenticated;

alter table public.conquista_members enable row level security;
alter table public.conquista_goals enable row level security;
alter table public.conquista_photos enable row level security;

revoke all on public.conquista_members from public, anon, authenticated;
revoke all on public.conquista_goals from public, anon, authenticated;
revoke all on public.conquista_photos from public, anon, authenticated;
grant select on public.conquista_members to authenticated;
grant select on public.conquista_goals to authenticated;
grant update (status, notes) on public.conquista_goals to authenticated;
grant select, insert, delete on public.conquista_photos to authenticated;
grant update (captured_on) on public.conquista_photos to authenticated;

drop policy if exists conquista_members_read on public.conquista_members;
create policy conquista_members_read on public.conquista_members
for select to authenticated using (public.conquista_is_member());

drop policy if exists conquista_goals_read on public.conquista_goals;
create policy conquista_goals_read on public.conquista_goals
for select to authenticated using (public.conquista_is_member());

drop policy if exists conquista_goals_edit on public.conquista_goals;
create policy conquista_goals_edit on public.conquista_goals
for update to authenticated
using (public.conquista_is_member() and (person = 'both' or person = public.conquista_my_person()))
with check (public.conquista_is_member() and (person = 'both' or person = public.conquista_my_person()));

drop policy if exists conquista_photos_read on public.conquista_photos;
create policy conquista_photos_read on public.conquista_photos
for select to authenticated using (public.conquista_is_member());

drop policy if exists conquista_photos_add on public.conquista_photos;
create policy conquista_photos_add on public.conquista_photos
for insert to authenticated with check (public.conquista_is_member() and user_id = auth.uid());

drop policy if exists conquista_photos_delete on public.conquista_photos;
create policy conquista_photos_delete on public.conquista_photos
for delete to authenticated using (public.conquista_is_member() and user_id = auth.uid());

drop policy if exists conquista_photos_edit on public.conquista_photos;
create policy conquista_photos_edit on public.conquista_photos
for update to authenticated
using (public.conquista_is_member() and user_id = auth.uid())
with check (public.conquista_is_member() and user_id = auth.uid());

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('conquista-evolucao', 'conquista-evolucao', false, 3145728, array['image/jpeg'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists conquista_files_read on storage.objects;
create policy conquista_files_read on storage.objects
for select to authenticated using (bucket_id = 'conquista-evolucao' and public.conquista_is_member());

drop policy if exists conquista_files_add on storage.objects;
create policy conquista_files_add on storage.objects
for insert to authenticated with check (
  bucket_id = 'conquista-evolucao' and public.conquista_is_member()
  and (storage.foldername(name))[1] = auth.uid()::text
  and name ~ ('^' || auth.uid()::text || '/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9]{4}-[0-9]{2}-[0-9]{2})[.]jpg$')
);

drop policy if exists conquista_files_delete on storage.objects;
create policy conquista_files_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'conquista-evolucao' and public.conquista_is_member()
  and (storage.foldername(name))[1] = auth.uid()::text
);

commit;

-- Resultado: guarde cada código com a pessoa correspondente.
-- Não compartilhe o código de um perfil com outra pessoa.
select case person when 'zayan' then 'Zayan' else 'Léo' end as nome,
  code::text as codigo_de_convite,
  case when claimed_by is null then 'Disponível' else 'Já vinculado' end as situacao
from conquista_private.invites order by person desc;
