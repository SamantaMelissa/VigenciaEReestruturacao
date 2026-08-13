-- Propostas de novos cursos e estrutura preparada para documentos futuros.
-- Execute uma vez em bancos que já possuem supabase/schema.sql aplicado.
-- Os arquivos ficam no Supabase Storage; esta migração registra apenas seus
-- metadados e caminhos, mantendo o acesso protegido pelas políticas abaixo.

begin;

do $$
begin
  create type public.course_proposal_status as enum (
    'rascunho',
    'submetida',
    'em_analise',
    'ajustes_solicitados',
    'aprovada_para_catalogo',
    'reprovada',
    'arquivada'
  );
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter type public.course_proposal_status add value if not exists 'cancelada';
exception
  when others then null;
end;
$$;

create table if not exists public.course_proposals (
  id uuid primary key default gen_random_uuid(),
  title text check (title is null or char_length(trim(title)) between 3 and 180),
  area text check (area is null or char_length(trim(area)) between 2 and 120),
  segment text,
  course_type text,
  level text,
  workload_hours integer check (workload_hours is null or workload_hours > 0),
  target_audience text,
  justification text check (justification is null or char_length(trim(justification)) >= 10),
  demand_evidence text,
  interested_units text[] not null default '{}',
  strategic_scenarios text[] not null default '{}',
  mapped_areas text[] not null default '{}',
  related_technologies text,
  status public.course_proposal_status not null default 'rascunho',
  manager_feedback text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.course_proposals
  add column if not exists mapped_areas text[] not null default '{}';

alter table public.course_proposals
  add column if not exists cancellation_reason text;

alter table public.course_proposals
  alter column area drop not null;

alter table public.course_proposals
  alter column title drop not null,
  alter column justification drop not null,
  drop constraint if exists course_proposals_title_check,
  drop constraint if exists course_proposals_justification_check,
  add constraint course_proposals_title_check check (title is null or char_length(trim(title)) between 3 and 180),
  add constraint course_proposals_justification_check check (justification is null or char_length(trim(justification)) >= 10);

do $$
begin
  alter table public.course_proposals
    add constraint course_proposals_mapped_areas_check
    check (mapped_areas <@ array['Desenvolvimento de software', 'Redes e Infraestrutura', 'Segurança Cibernética', 'Cloud e DevOps', 'Dados']::text[]);
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.course_proposal_documents (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.course_proposals(id) on delete cascade,
  document_type text not null check (document_type in ('plano_de_curso', 'estudo_de_demanda', 'parecer_tecnico', 'outro')),
  original_name text not null,
  storage_path text not null unique,
  mime_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  version integer not null default 1 check (version > 0),
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.course_proposal_events (
  id bigint generated always as identity primary key,
  proposal_id uuid not null references public.course_proposals(id) on delete cascade,
  action text not null,
  old_status public.course_proposal_status,
  new_status public.course_proposal_status,
  details jsonb not null default '{}'::jsonb,
  actor_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists course_proposals_status_idx on public.course_proposals(status);
create index if not exists course_proposals_created_by_idx on public.course_proposals(created_by);
create index if not exists proposal_documents_proposal_idx on public.course_proposal_documents(proposal_id);
create index if not exists proposal_events_proposal_idx on public.course_proposal_events(proposal_id, created_at desc);

create or replace function public.set_course_proposal_dates()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'submetida' and (tg_op = 'INSERT' or old.status is distinct from 'submetida') then
    new.submitted_at = coalesce(new.submitted_at, now());
  end if;
  if tg_op = 'UPDATE'
     and new.status in ('em_analise', 'ajustes_solicitados', 'aprovada_para_catalogo', 'reprovada', 'arquivada')
     and new.status is distinct from old.status then
    new.reviewed_at = now();
    new.reviewed_by = auth.uid();
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.protect_course_proposal_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if public.current_user_role() not in ('gestor', 'admin')
       and new.status is distinct from old.status
       and not (
         old.status = 'rascunho' and new.status = 'submetida'
         or old.status = 'ajustes_solicitados' and new.status = 'submetida'
         or new.status = 'cancelada'
       ) then
      raise exception 'Somente gestores podem alterar esse status de proposta.';
    end if;
  end if;
  if new.status not in ('rascunho', 'cancelada') and (
    new.title is null or char_length(trim(new.title)) < 3
    or coalesce(cardinality(new.mapped_areas), 0) = 0
    or new.justification is null or char_length(trim(new.justification)) < 10
  ) then
    raise exception 'Preencha nome, área mapeada e justificativa antes de enviar a proposta.';
  end if;
  return new;
end;
$$;

drop trigger if exists course_proposals_protect_transition on public.course_proposals;
create trigger course_proposals_protect_transition
before insert or update on public.course_proposals
for each row execute function public.protect_course_proposal_transition();

drop trigger if exists course_proposals_set_dates on public.course_proposals;
create trigger course_proposals_set_dates
before insert or update on public.course_proposals
for each row execute function public.set_course_proposal_dates();

create or replace function public.log_course_proposal_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.course_proposal_events (proposal_id, action, new_status, actor_id)
    values (new.id, 'criada', new.status, new.created_by);
  elsif new.status is distinct from old.status then
    insert into public.course_proposal_events (proposal_id, action, old_status, new_status, details, actor_id)
    values (
      new.id,
      'status_alterado',
      old.status,
      new.status,
      jsonb_build_object('manager_feedback', coalesce(new.manager_feedback, ''), 'cancellation_reason', coalesce(new.cancellation_reason, '')),
      auth.uid()
    );
  elsif new.manager_feedback is distinct from old.manager_feedback then
    insert into public.course_proposal_events (proposal_id, action, details, actor_id)
    values (new.id, 'parecer_atualizado', jsonb_build_object('manager_feedback', coalesce(new.manager_feedback, '')), auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists course_proposals_log_event on public.course_proposals;
create trigger course_proposals_log_event
after insert or update on public.course_proposals
for each row execute function public.log_course_proposal_event();

alter table public.course_proposals enable row level security;
alter table public.course_proposal_documents enable row level security;
alter table public.course_proposal_events enable row level security;

drop policy if exists "Users view own proposals and managers view all" on public.course_proposals;
create policy "Users view own proposals and managers view all"
on public.course_proposals for select to authenticated
using (created_by = auth.uid() or public.current_user_role() in ('gestor', 'admin'));

drop policy if exists "Users create proposals" on public.course_proposals;
create policy "Users create proposals"
on public.course_proposals for insert to authenticated
with check (created_by = auth.uid());

drop policy if exists "Users edit editable own proposals" on public.course_proposals;
create policy "Users edit editable own proposals"
on public.course_proposals for update to authenticated
using (created_by = auth.uid() and status in ('rascunho', 'ajustes_solicitados'))
with check (created_by = auth.uid() and status in ('rascunho', 'submetida', 'ajustes_solicitados'));

drop policy if exists "Managers update proposals" on public.course_proposals;
create policy "Managers update proposals"
on public.course_proposals for update to authenticated
using (public.current_user_role() in ('gestor', 'admin'))
with check (public.current_user_role() in ('gestor', 'admin'));

drop policy if exists "Users delete own draft proposals" on public.course_proposals;
create policy "Users delete own draft proposals"
on public.course_proposals for delete to authenticated
using (created_by = auth.uid() and status = 'rascunho');

drop policy if exists "Users cancel own proposals" on public.course_proposals;
create policy "Users cancel own proposals"
on public.course_proposals for update to authenticated
using (created_by = auth.uid() and status in ('rascunho', 'submetida', 'em_analise', 'ajustes_solicitados', 'reprovada'))
with check (created_by = auth.uid() and status = 'cancelada');

drop policy if exists "Managers delete proposals" on public.course_proposals;
create policy "Managers delete proposals"
on public.course_proposals for delete to authenticated
using (public.current_user_role() in ('gestor', 'admin'));

drop policy if exists "Users view proposal documents" on public.course_proposal_documents;
create policy "Users view proposal documents"
on public.course_proposal_documents for select to authenticated
using (
  exists (
    select 1 from public.course_proposals proposal
    where proposal.id = proposal_id
      and (proposal.created_by = auth.uid() or public.current_user_role() in ('gestor', 'admin'))
  )
);

drop policy if exists "Users add documents to editable proposals" on public.course_proposal_documents;
create policy "Users add documents to editable proposals"
on public.course_proposal_documents for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and exists (
    select 1 from public.course_proposals proposal
    where proposal.id = proposal_id
      and ((proposal.created_by = auth.uid() and proposal.status in ('rascunho', 'ajustes_solicitados'))
        or public.current_user_role() in ('gestor', 'admin'))
  )
);

drop policy if exists "Managers manage proposal documents" on public.course_proposal_documents;
create policy "Managers manage proposal documents"
on public.course_proposal_documents for all to authenticated
using (public.current_user_role() in ('gestor', 'admin'))
with check (public.current_user_role() in ('gestor', 'admin'));

drop policy if exists "Users view proposal history" on public.course_proposal_events;
create policy "Users view proposal history"
on public.course_proposal_events for select to authenticated
using (
  exists (
    select 1 from public.course_proposals proposal
    where proposal.id = proposal_id
      and (proposal.created_by = auth.uid() or public.current_user_role() in ('gestor', 'admin'))
  )
);

grant select, insert, update, delete on public.course_proposals to authenticated;
grant select, insert, update, delete on public.course_proposal_documents to authenticated;
grant select on public.course_proposal_events to authenticated;

commit;
