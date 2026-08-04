-- Execute uma vez no SQL Editor do Supabase.
-- Melhora justificativas antigas e preserva integralmente o texto anterior.

begin;

create table if not exists public.evaluations_justification_backup_20260804
as select now() as backup_at, evaluation.*
from public.evaluations evaluation
where false;

insert into public.evaluations_justification_backup_20260804
select now(), evaluation.*
from public.evaluations evaluation
where evaluation.status = 'concluida'
  and evaluation.justification is not null
  and coalesce(evaluation.state ->> 'justificationNormalizedVersion', '') <> '2026-08-04-v1'
  and (
    evaluation.state ? 'sourceId'
    or lower(coalesce(evaluation.state ->> 'imported', 'false')) = 'true'
    or evaluation.justification ~ '(^|\n)\s*(SIM|NÃO)\s+[—-]'
    or evaluation.justification = upper(evaluation.justification)
  )
  and not exists (
    select 1
    from public.evaluations_justification_backup_20260804 backup
    where backup.id = evaluation.id
  );

create or replace function public.build_legacy_justification(
  p_course_name text,
  p_criterion_label text,
  p_final_result text,
  p_original text,
  p_observation text default null
)
returns text
language plpgsql
immutable
as $$
declare
  source_text text := lower(translate(coalesce(p_original, ''),
    'ÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ', 'AAAAEEEIIIOOOOUUUC'));
  evidence text[] := array[]::text[];
  conclusion text;
begin
  if source_text like '%nao houve oferta continua%' then
    evidence := array_append(evidence, 'Não foi confirmada oferta contínua no período analisado.');
  elsif source_text like '%houve oferta continua%' then
    evidence := array_append(evidence, 'Foi confirmada oferta contínua no período analisado.');
  end if;

  if source_text like '%nao houve oferta do curso em algum%' then
    evidence := array_append(evidence, 'Não houve oferta nos anos considerados.');
  elsif source_text like '%houve oferta do curso em algum%' then
    evidence := array_append(evidence, 'Houve oferta em pelo menos um dos anos considerados.');
  end if;

  if source_text like '%mais de uma escola oferta%' then
    evidence := array_append(evidence, 'O título é ofertado por mais de uma escola.');
  elsif source_text like '%somente uma escola oferta%' then
    evidence := array_append(evidence, 'O título possui oferta registrada em somente uma escola.');
  end if;

  if source_text like '%curso nao responde%cenario%' then
    evidence := array_append(evidence, 'O curso não foi relacionado aos cenários estratégicos mapeados.');
  elsif source_text like '%curso responde%cenario%' or source_text like '%cenario %' then
    evidence := array_append(evidence, 'O curso está relacionado aos cenários estratégicos mapeados.');
  end if;

  if source_text like '%cbo%nao tem empregabilidade%' or source_text like '%cbo%nao tem%empregabilidade%' then
    evidence := array_append(evidence, 'Não foi identificada empregabilidade suficiente para as ocupações relacionadas.');
  elsif source_text like '%cbo%empregabilidade%' then
    evidence := array_append(evidence, 'As ocupações relacionadas apresentam empregabilidade no mapa de emprego.');
  end if;

  if source_text like '%nao e uma qualificacao fic sem perfil%' then
    evidence := array_append(evidence, 'A qualificação possui perfil profissional FIC.');
  elsif source_text like '%e uma qualificacao fic sem perfil%' then
    evidence := array_append(evidence, 'A qualificação FIC ainda não possui perfil profissional FIC.');
  end if;

  if source_text like '%perfil profissional nao tem mais de 4 anos%' then
    evidence := array_append(evidence, 'O perfil profissional possui até quatro anos.');
  elsif source_text like '%perfil profissional tem mais de 4 anos%' then
    evidence := array_append(evidence, 'O perfil profissional possui mais de quatro anos.');
  end if;

  if source_text like '%nao ha alguma tecnologia%' then
    evidence := array_append(evidence, 'Não foram identificadas tecnologias que precisem ser incluídas ou retiradas.');
  elsif source_text like '%ha alguma tecnologia%' then
    evidence := array_append(evidence, 'Foram identificadas tecnologias que precisam ser incluídas ou retiradas.');
  end if;

  if source_text like '%tecnologia%altera o perfil profissional%' then
    evidence := array_append(evidence, 'A alteração tecnológica impacta o perfil profissional.');
  end if;

  if source_text like '%desenho curricular%nao%vinculado%' then
    evidence := array_append(evidence, 'O desenho curricular precisa ser revisto para se vincular ao perfil profissional.');
  elsif source_text like '%desenho curricular%vinculado%' then
    evidence := array_append(evidence, 'O desenho curricular está vinculado ao perfil profissional.');
  end if;

  if source_text like '%padroes de desempenho%nao estao%' then
    evidence := array_append(evidence, 'Os padrões de desempenho precisam ser reescritos como capacidades observáveis.');
  end if;

  if source_text like '%data de abertura%nao esta entre%' then
    evidence := array_append(evidence, 'A vigência foi aberta fora do período de 2024 a 2025.');
  elsif source_text like '%data de abertura%esta entre%' then
    evidence := array_append(evidence, 'A vigência foi aberta entre 2024 e 2025.');
  end if;

  if source_text like '%escola nao tem uma justificativa%' or source_text like '%nao tem justificativa tecnica%' then
    evidence := array_append(evidence, 'A escola não apresentou justificativa técnica suficiente para a manutenção do curso.');
  elsif source_text like '%escola tem uma justificativa%' and p_original like '%?%' then
    evidence := array_append(evidence, 'Foi registrada a necessidade de confirmar com a escola uma justificativa técnica para a manutenção do curso.');
  elsif source_text like '%escola tem uma justificativa%' then
    evidence := array_append(evidence, 'A escola apresentou justificativa técnica para a manutenção do curso.');
  end if;

  conclusion := case
    when coalesce(trim(p_final_result), '') = '' then ''
    else format(' Diante das evidências registradas, recomenda-se %s.', lower(trim(p_final_result)))
  end;

  return format(
    'A análise do curso %s foi conduzida conforme o %s.%s%s%s',
    p_course_name,
    p_criterion_label,
    case when cardinality(evidence) > 0
      then ' ' || array_to_string(evidence, ' ')
      else ' Não há detalhamento suficiente do percurso na fonte original.' end,
    case when coalesce(trim(p_observation), '') <> ''
      then format(' Como registro adicional, consta: %s.', trim(p_observation))
      else '' end,
    conclusion
  );
end;
$$;

update public.evaluations evaluation
set state = coalesce(evaluation.state, '{}'::jsonb) || jsonb_build_object(
      'justificationOriginal', evaluation.justification,
      'justificationNormalizedAt', now(),
      'justificationNormalizedVersion', '2026-08-04-v1'
    ),
    justification = public.build_legacy_justification(
      evaluation.course_name,
      evaluation.criterion_label,
      evaluation.final_result,
      evaluation.justification,
      evaluation.state ->> 'observations'
    )
where evaluation.status = 'concluida'
  and evaluation.justification is not null
  and coalesce(evaluation.state ->> 'justificationNormalizedVersion', '') <> '2026-08-04-v1'
  and (
    evaluation.state ? 'sourceId'
    or lower(coalesce(evaluation.state ->> 'imported', 'false')) = 'true'
    or evaluation.justification ~ '(^|\n)\s*(SIM|NÃO)\s+[—-]'
    or evaluation.justification = upper(evaluation.justification)
  );

commit;

-- Conferência: compare texto normalizado e original preservado.
select
  course_code,
  course_name,
  justification,
  state ->> 'justificationOriginal' as justification_original
from public.evaluations
where state ->> 'justificationNormalizedVersion' = '2026-08-04-v1'
order by course_code;
