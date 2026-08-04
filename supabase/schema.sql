-- Radar de Cursos SENAI
-- Execute este arquivo uma única vez no SQL Editor do Supabase.

begin;

create extension if not exists pgcrypto;

create type public.app_role as enum ('avaliador', 'gestor', 'admin');
create type public.evaluation_status as enum ('rascunho', 'em_analise', 'concluida');
create type public.contact_status as enum ('pendente', 'em_contato', 'concluido');
create type public.answer_source as enum ('usuario', 'base_ti', 'unidade');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  unit_code text,
  role public.app_role not null default 'avaliador',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.evaluations (
  id uuid primary key default gen_random_uuid(),
  course_code text not null,
  course_name text not null,
  criterion_key text not null check (criterion_key in ('regular', 'fic')),
  criterion_label text not null,
  status public.evaluation_status not null default 'rascunho',
  current_question integer,
  final_result text,
  justification text,
  state jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.evaluation_answers (
  id bigint generated always as identity primary key,
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  question_step integer not null,
  question_text text not null,
  answer boolean not null,
  source public.answer_source not null default 'usuario',
  evidence jsonb not null default '{}'::jsonb,
  answered_by uuid references public.profiles(id),
  answered_at timestamptz not null default now(),
  unique (evaluation_id, question_step)
);

create table public.school_validations (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid references public.evaluations(id) on delete set null,
  course_code text not null,
  course_name text not null,
  criterion_key text not null check (criterion_key in ('regular', 'fic')),
  criterion_label text not null,
  units text[] not null default '{}',
  enrollments jsonb not null default '{}'::jsonb,
  reason_question text not null,
  decision_trail jsonb not null default '[]'::jsonb,
  status public.contact_status not null default 'pendente',
  responsible_name text,
  responsible_user_id uuid references public.profiles(id),
  contacted_unit text,
  contact_date date,
  notes text,
  school_answer boolean,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  concluded_at timestamptz
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  actor_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.course_analysis_scope (
  course_code text primary key,
  course_name text not null,
  creator_unit text not null,
  is_analyzable boolean not null,
  updated_at timestamptz not null default now()
);

create index evaluations_course_code_idx on public.evaluations(course_code);
create index evaluations_status_idx on public.evaluations(status);
create index evaluations_created_by_idx on public.evaluations(created_by);
create unique index evaluations_one_active_per_course_idx on public.evaluations(course_code)
where status in ('rascunho', 'em_analise');
create index answers_evaluation_idx on public.evaluation_answers(evaluation_id);
create index validations_course_code_idx on public.school_validations(course_code);
create index validations_status_idx on public.school_validations(status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger evaluations_set_updated_at before update on public.evaluations
for each row execute function public.set_updated_at();
create trigger validations_set_updated_at before update on public.school_validations
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Garante perfil também para usuários criados antes da execução deste script.
insert into public.profiles (id, display_name)
select id, coalesce(raw_user_meta_data ->> 'display_name', email)
from auth.users
on conflict (id) do nothing;

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    -- Bootstrap seguro: permite criar o primeiro administrador pelo SQL Editor.
    -- Depois que um admin existe, somente administradores promovem outros usuários.
    if new.role = 'admin'
       and not exists (select 1 from public.profiles where role = 'admin') then
      return new;
    end if;

    if coalesce(public.current_user_role(), 'avaliador') <> 'admin' then
      raise exception 'Somente administradores podem alterar perfis de acesso.';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_role
before update on public.profiles
for each row execute function public.protect_profile_role();

create or replace function public.complete_contact_from_answer()
returns trigger
language plpgsql
as $$
begin
  if new.school_answer is not null then
    new.status = 'concluido';
    new.concluded_at = coalesce(new.concluded_at, now());
  end if;
  return new;
end;
$$;

create trigger validations_complete_from_answer
before insert or update on public.school_validations
for each row execute function public.complete_contact_from_answer();

alter table public.profiles enable row level security;
alter table public.evaluations enable row level security;
alter table public.evaluation_answers enable row level security;
alter table public.school_validations enable row level security;
alter table public.audit_events enable row level security;
alter table public.course_analysis_scope enable row level security;

create policy "Authenticated users can view profiles"
on public.profiles for select to authenticated using (true);

create policy "Users update own profile and admins update all"
on public.profiles for update to authenticated
using (id = auth.uid() or public.current_user_role() = 'admin')
with check (id = auth.uid() or public.current_user_role() = 'admin');

create policy "Authenticated users can view permitted evaluations"
on public.evaluations for select to authenticated
using (
  status = 'concluida'
  or created_by = auth.uid()
  or public.current_user_role() in ('gestor', 'admin')
);

create policy "Authenticated users create evaluations"
on public.evaluations for insert to authenticated
with check (created_by = auth.uid());

create policy "Owners and managers update evaluations"
on public.evaluations for update to authenticated
using (
  created_by = auth.uid()
  or public.current_user_role() in ('gestor', 'admin')
)
with check (
  created_by = auth.uid()
  or public.current_user_role() in ('gestor', 'admin')
);

create policy "Admins delete evaluations"
on public.evaluations for delete to authenticated
using (public.current_user_role() = 'admin');

create policy "Owners delete own unfinished evaluations"
on public.evaluations for delete to authenticated
using (
  created_by = auth.uid()
  and status in ('rascunho', 'em_analise')
);

create policy "Authenticated users can view answers"
on public.evaluation_answers for select to authenticated using (true);

create policy "Evaluation owners add answers"
on public.evaluation_answers for insert to authenticated
with check (
  answered_by = auth.uid()
  and exists (
    select 1 from public.evaluations e
    where e.id = evaluation_id
      and (e.created_by = auth.uid() or public.current_user_role() in ('gestor', 'admin'))
  )
);

create policy "Evaluation owners update answers"
on public.evaluation_answers for update to authenticated
using (
  exists (
    select 1 from public.evaluations e
    where e.id = evaluation_id
      and (e.created_by = auth.uid() or public.current_user_role() in ('gestor', 'admin'))
  )
)
with check (
  answered_by = auth.uid()
  or public.current_user_role() in ('gestor', 'admin')
);

create policy "Admins delete answers"
on public.evaluation_answers for delete to authenticated
using (public.current_user_role() = 'admin');

create policy "Authenticated users can view validations"
on public.school_validations for select to authenticated using (true);

create policy "Authenticated users create validations"
on public.school_validations for insert to authenticated
with check (created_by = auth.uid());

create policy "Managers update validations"
on public.school_validations for update to authenticated
using (public.current_user_role() in ('gestor', 'admin'))
with check (public.current_user_role() in ('gestor', 'admin'));

create policy "Admins delete validations"
on public.school_validations for delete to authenticated
using (public.current_user_role() = 'admin');

create policy "Managers can view audit events"
on public.audit_events for select to authenticated
using (public.current_user_role() in ('gestor', 'admin'));

create policy "Authenticated users view course analysis scope"
on public.course_analysis_scope for select to authenticated
using (true);

create policy "Managers maintain course analysis scope"
on public.course_analysis_scope for all to authenticated
using (public.current_user_role() in ('gestor', 'admin'))
with check (public.current_user_role() in ('gestor', 'admin'));

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.evaluations to authenticated;
drop function if exists public.list_active_evaluation_claims();
create function public.list_active_evaluation_claims()
returns table(course_code text, created_by uuid, status public.evaluation_status, updated_at timestamptz, available_for_claim boolean)
language sql stable security definer set search_path = public
as $$
  select evaluation.course_code, evaluation.created_by, evaluation.status, evaluation.updated_at,
    lower(coalesce(evaluation.state ->> 'validationReady', 'false')) = 'true'
  from public.evaluations evaluation
  where evaluation.status in ('rascunho', 'em_analise');
$$;
revoke all on function public.list_active_evaluation_claims() from public;
grant execute on function public.list_active_evaluation_claims() to authenticated;
create or replace function public.apply_school_validation_return(
  p_validation_id uuid,
  p_positive boolean,
  p_trail jsonb
)
returns table(evaluation_id uuid, evaluation_status public.evaluation_status, next_question integer)
language plpgsql security definer set search_path = public
as $$
declare
  validation public.school_validations%rowtype;
  target_evaluation public.evaluations%rowtype;
  calculated_next integer;
  calculated_status public.evaluation_status;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;
  if public.current_user_role() not in ('gestor', 'admin') then
    raise exception 'Somente gestores podem registrar o retorno da escola.';
  end if;
  select * into validation from public.school_validations where id = p_validation_id for update;
  if not found then raise exception 'Validação não encontrada.'; end if;
  select * into target_evaluation from public.evaluations
    where course_code = validation.course_code and status in ('rascunho', 'em_analise')
    order by updated_at desc limit 1 for update;
  if target_evaluation.id is null and validation.evaluation_id is not null then
    select * into target_evaluation from public.evaluations where id = validation.evaluation_id for update;
  end if;
  calculated_next := case when validation.criterion_key = 'fic' then 6 else 7 end;
  calculated_status := case when p_positive then 'rascunho'::public.evaluation_status else 'concluida'::public.evaluation_status end;
  if target_evaluation.id is null then
    insert into public.evaluations(course_code,course_name,criterion_key,criterion_label,status,current_question,final_result,justification,state,created_by,completed_at)
    values(validation.course_code,validation.course_name,validation.criterion_key,validation.criterion_label,calculated_status,
      case when p_positive then calculated_next else null end,case when p_positive then null else 'FECHAR A VIGÊNCIA' end,
      case when p_positive then null else 'A unidade não apresentou justificativa técnica para manter o curso. Diante do retorno registrado na Central de Validações, recomenda-se fechar a vigência.' end,
      jsonb_build_object('answers',coalesce(p_trail,'[]'::jsonb),'decisionPath',coalesce(p_trail,'[]'::jsonb),'enrollments',validation.enrollments,'units',validation.units,'returnedFromContact',true,'validationReady',p_positive),
      auth.uid(),case when p_positive then null else now() end) returning * into target_evaluation;
  else
    update public.evaluations set status=calculated_status,current_question=case when p_positive then calculated_next else null end,
      final_result=case when p_positive then null else 'FECHAR A VIGÊNCIA' end,
      justification=case when p_positive then null else 'A unidade não apresentou justificativa técnica para manter o curso. Diante do retorno registrado na Central de Validações, recomenda-se fechar a vigência.' end,
      completed_at=case when p_positive then null else now() end,
      state=coalesce(state,'{}'::jsonb)||jsonb_build_object('answers',coalesce(p_trail,'[]'::jsonb),'decisionPath',coalesce(p_trail,'[]'::jsonb),'enrollments',validation.enrollments,'units',validation.units,'returnedFromContact',true,'validationReady',p_positive)
      where id=target_evaluation.id returning * into target_evaluation;
  end if;
  update public.school_validations set evaluation_id=target_evaluation.id where id=validation.id;
  return query select target_evaluation.id,target_evaluation.status,case when p_positive then calculated_next else null end;
end;
$$;
revoke all on function public.apply_school_validation_return(uuid, boolean, jsonb) from public;
grant execute on function public.apply_school_validation_return(uuid, boolean, jsonb) to authenticated;
create or replace function public.claim_ready_evaluation(p_course_code text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare target_id uuid;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;
  select evaluation.id into target_id from public.evaluations evaluation
    where evaluation.course_code=p_course_code and evaluation.status in ('rascunho','em_analise')
      and lower(coalesce(evaluation.state ->> 'validationReady','false'))='true'
    order by evaluation.updated_at desc limit 1 for update;
  if target_id is null then raise exception 'Este retorno já foi assumido por outro usuário.'; end if;
  update public.evaluations evaluation set created_by=auth.uid(),status='em_analise',
    state=jsonb_set(coalesce(evaluation.state,'{}'::jsonb),'{validationReady}','false'::jsonb,true),updated_at=now()
    where evaluation.id=target_id;
  return target_id;
end;
$$;
revoke all on function public.claim_ready_evaluation(text) from public;
grant execute on function public.claim_ready_evaluation(text) to authenticated;
create or replace function public.claim_pending_evaluation(p_course_code text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare target public.evaluations%rowtype;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;
  select evaluation.* into target from public.evaluations evaluation
  where evaluation.course_code=p_course_code and evaluation.status='rascunho'
  order by evaluation.updated_at desc limit 1 for update;
  if target.id is null then raise exception 'Esta análise não está mais disponível para assumir.'; end if;
  if exists (select 1 from public.school_validations validation where validation.course_code=p_course_code and validation.status in ('pendente','em_contato')) then
    raise exception 'Esta análise está em validação com a unidade.';
  end if;
  update public.evaluations set created_by=auth.uid(),status='em_analise',updated_at=now() where id=target.id;
  return target.id;
end;
$$;
revoke all on function public.claim_pending_evaluation(text) from public;
grant execute on function public.claim_pending_evaluation(text) to authenticated;
update public.evaluations evaluation
set state=jsonb_set(coalesce(evaluation.state,'{}'::jsonb),'{validationReady}','true'::jsonb,true),updated_at=now()
from public.school_validations validation
where validation.evaluation_id=evaluation.id and validation.school_answer is true
  and validation.status='concluido' and evaluation.status in ('rascunho','em_analise')
  and lower(coalesce(evaluation.state ->> 'validationReady','false'))<>'true';
grant select, insert, update, delete on public.evaluation_answers to authenticated;
grant select, insert, update, delete on public.school_validations to authenticated;
grant select on public.audit_events to authenticated;
grant select, insert, update, delete on public.course_analysis_scope to authenticated;
grant usage, select on all sequences in schema public to authenticated;

commit;
