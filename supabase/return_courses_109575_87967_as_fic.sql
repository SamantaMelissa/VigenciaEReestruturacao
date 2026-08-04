-- Corrige a classificação dos cursos 109575 e 87967 e devolve ambos à fila.
-- Pode ser executado com segurança mais de uma vez.

begin;

-- O critério dos cursos pendentes passa a existir também no banco. Valores
-- nulos mantêm compatibilidade com os demais cursos, que usam a base local.
alter table public.course_analysis_scope
  add column if not exists criterion_key text;

alter table public.course_analysis_scope
  drop constraint if exists course_analysis_scope_criterion_key_check;

alter table public.course_analysis_scope
  add constraint course_analysis_scope_criterion_key_check
  check (criterion_key is null or criterion_key in ('regular', 'fic'));

-- Preserva uma cópia integral das avaliações incorretas.
insert into public.audit_events (entity_type, entity_id, action, old_data, new_data)
select
  'evaluation',
  evaluation.id::text,
  'invalidated_wrong_criterion',
  to_jsonb(evaluation),
  jsonb_build_object(
    'course_code', evaluation.course_code,
    'correct_criterion_key', 'fic',
    'correct_criterion_label', 'Critério FIC',
    'reason', 'Decisão invalidada porque o curso foi analisado como Regular / Qualificação.'
  )
from public.evaluations evaluation
where evaluation.course_code in ('109575', '87967')
  and not exists (
    select 1 from public.audit_events audit
    where audit.entity_type = 'evaluation'
      and audit.entity_id = evaluation.id::text
      and audit.action = 'invalidated_wrong_criterion'
  );

-- Descarta encaminhamentos e decisões derivados do questionário incorreto.
delete from public.school_validations
where course_code in ('109575', '87967');

-- evaluation_answers é removida pelo ON DELETE CASCADE. A ausência de uma
-- avaliação ativa/concluída faz os cursos reaparecerem na fila de pendentes.
delete from public.evaluations
where course_code in ('109575', '87967');

insert into public.course_analysis_scope
  (course_code, course_name, creator_unit, is_analyzable, criterion_key, updated_at)
values
  ('109575', 'INTELIGÊNCIA ARTIFICIAL APLICADA A SISTEMAS EMBARCADOS', 'GED', true, 'fic', now()),
  ('87967', 'DESENVOLVIMENTO PARA DISPOSITIVOS MÓVEIS', 'GED', true, 'fic', now())
on conflict (course_code) do update
set course_name = excluded.course_name,
    creator_unit = excluded.creator_unit,
    is_analyzable = true,
    criterion_key = 'fic',
    updated_at = now();

commit;

select scope.course_code,
       scope.course_name,
       scope.criterion_key,
       scope.is_analyzable,
       not exists (
         select 1 from public.evaluations evaluation
         where evaluation.course_code = scope.course_code
       ) as returned_to_pending
from public.course_analysis_scope scope
where scope.course_code in ('109575', '87967')
order by scope.course_code;
