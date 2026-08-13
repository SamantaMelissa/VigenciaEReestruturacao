-- Cancelamento de propostas com motivo registrado (status 'cancelada').
-- Execute uma vez no SQL Editor em bancos que já possuem enable_course_proposals.sql aplicado.
-- Idempotente.

begin;

do $$
begin
  alter type public.course_proposal_status add value if not exists 'cancelada';
exception
  when others then null;
end;
$$;

commit;

-- A partir daqui o novo valor 'cancelada' já está commitado e pode ser usado.
begin;

alter table public.course_proposals
  add column if not exists cancellation_reason text;

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

drop policy if exists "Users cancel own proposals" on public.course_proposals;
create policy "Users cancel own proposals"
on public.course_proposals for update to authenticated
using (created_by = auth.uid() and status in ('rascunho', 'submetida', 'em_analise', 'ajustes_solicitados', 'reprovada'))
with check (created_by = auth.uid() and status = 'cancelada');

commit;