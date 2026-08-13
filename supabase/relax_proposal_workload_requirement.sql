-- Torna a carga horária opcional no envio e mantém o cancelamento habilitado.
-- Execute no SQL Editor em bancos que já possuem enable_course_proposals.sql aplicado.
-- Idempotente. Para bancos novos, a versão atual de enable_course_proposals.sql já
-- inclui este comportamento; este arquivo é um ajuste seguro para bancos antigos.

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

commit;