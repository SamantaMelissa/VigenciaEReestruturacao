-- Simplificação do fluxo de propostas: remoção da análise gerencial.
-- Ao finalizar, a proposta é registrada diretamente no sistema (status
-- 'submetida', exibido como "Registrada"). Autor e gestores podem editar
-- propostas ativas e excluí-las com motivo (status 'cancelada' +
-- cancellation_reason). A transição de status por não gestores fica
-- restrita ao cancelamento com motivo.
--
-- Execute uma vez no SQL Editor em bancos que já possuem
-- enable_course_proposals.sql (e cancelamento) aplicado. Idempotente.
-- Para bancos novos, a versão atual de enable_course_proposals.sql já
-- contém esse comportamento.

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
       and new.status <> 'cancelada' then
      raise exception 'A proposta registrada só pode ser editada ou excluída com motivo.';
    end if;
  end if;
  if new.status <> 'cancelada' and (
    new.title is null or char_length(trim(new.title)) < 3
    or coalesce(cardinality(new.mapped_areas), 0) = 0
    or new.justification is null or char_length(trim(new.justification)) < 10
  ) then
    raise exception 'Preencha nome, área mapeada e justificativa antes de registrar a proposta.';
  end if;
  return new;
end;
$$;

drop trigger if exists course_proposals_protect_transition on public.course_proposals;
create trigger course_proposals_protect_transition
before insert or update on public.course_proposals
for each row execute function public.protect_course_proposal_transition();

drop policy if exists "Users edit editable own proposals" on public.course_proposals;
drop policy if exists "Users cancel own proposals" on public.course_proposals;

create policy "Users edit own active proposals"
on public.course_proposals for update to authenticated
using (created_by = auth.uid() and status <> 'cancelada')
with check (created_by = auth.uid());