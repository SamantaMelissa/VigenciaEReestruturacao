-- Relaxa a exigência de carga horária no envio de propostas de cursos.
-- Execute no SQL Editor em bancos que já possuem enable_course_proposals.sql aplicado.
-- Idempotente: recria a função de gatilho com a nova regra.

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
       ) then
      raise exception 'Somente gestores podem alterar esse status de proposta.';
    end if;
  end if;
  if new.status <> 'rascunho' and (
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