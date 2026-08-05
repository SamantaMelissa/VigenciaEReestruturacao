-- Mapeia avaliações sem áreas/cenários registrados a partir do título.
-- Fluxo seguro: execute, revise a tabela, aprove as linhas e execute novamente.

create table if not exists public.evaluation_area_mapping_review (
  evaluation_id uuid primary key references public.evaluations(id) on delete cascade,
  course_code text not null,
  course_name text not null,
  final_result text,
  mapped_areas text[] not null default '{}',
  display_value text not null,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.evaluation_area_mapping_review enable row level security;
revoke all on public.evaluation_area_mapping_review from anon, authenticated;

with candidates as (
  select
    evaluation.id,
    evaluation.course_code,
    evaluation.course_name,
    evaluation.final_result,
    lower(evaluation.course_name) as title,
    lower(coalesce(evaluation.final_result, '')) like '%fechar%' as closes_course
  from public.evaluations evaluation
  where evaluation.status = 'concluida'
    and not jsonb_path_exists(coalesce(evaluation.state, '{}'::jsonb), '$.scenarioSelections.*[*]')
    and not jsonb_path_exists(coalesce(evaluation.state, '{}'::jsonb), '$.decisionPath[*].scenarios[*]')
    and coalesce(jsonb_array_length(coalesce(evaluation.state -> 'mappedAreasByTitle', '[]'::jsonb)), 0) = 0
), inferred as (
  select
    candidate.*,
    array_remove(array[
      case when candidate.title ~ 'cloud|nuvem|devops'
        then 'Cloud e DevOps' end,
      case when candidate.title ~ 'ciber|cyber|segurança|pentest|forense|vulnerabilidade|lgpd'
        then 'Segurança Cibernética' end,
      case when candidate.title ~ 'banco de dados|data |dados|business intelligence|power bi|tableau|sql|excel|big data|analytics'
        then 'Dados' end,
      case when candidate.title ~ 'rede|infraestrutura|servidor|hardware|suporte técnico|fibra óptica|linux|windows'
        then 'Redes e Infraestrutura' end,
      case when candidate.title ~ 'desenvolv|programa|software|web|aplicativo|app |mobile|java|python|php|javascript|lógica|algoritmo|iot|jogos digitais'
        then 'Desenvolvimento de software' end
    ], null) as areas
  from candidates candidate
)
insert into public.evaluation_area_mapping_review (
  evaluation_id, course_code, course_name, final_result, mapped_areas, display_value
)
select
  inferred.id,
  inferred.course_code,
  inferred.course_name,
  inferred.final_result,
  case when inferred.closes_course then '{}'::text[] else inferred.areas end,
  case
    when inferred.closes_course then 'FECHAR VIGÊNCIA'
    when cardinality(inferred.areas) > 0 then array_to_string(inferred.areas, '; ')
    else 'REVISÃO MANUAL NECESSÁRIA'
  end
from inferred
on conflict (evaluation_id) do nothing;

-- 1. Revise todas as sugestões. Você pode editar mapped_areas antes de aprovar.
select
  course_code,
  course_name,
  final_result,
  mapped_areas,
  display_value,
  approved
from public.evaluation_area_mapping_review
order by display_value, course_name;

-- 2. Exemplos de aprovação (execute manualmente depois da revisão):
-- update public.evaluation_area_mapping_review
-- set approved = true, reviewed_at = now()
-- where display_value <> 'REVISÃO MANUAL NECESSÁRIA';
--
-- update public.evaluation_area_mapping_review
-- set mapped_areas = array['Dados'],
--     display_value = 'Dados',
--     approved = true,
--     reviewed_at = now()
-- where course_code = 'CODIGO_DO_CURSO';

-- 3. Ao executar novamente este arquivo, somente linhas aprovadas são gravadas.
update public.evaluations evaluation
set state = coalesce(evaluation.state, '{}'::jsonb) || jsonb_build_object(
  'mappedAreasByTitle', to_jsonb(review.mapped_areas),
  'mappedAreasLabel', review.display_value,
  'mappedAreasSource', 'course_title_review',
  'mappedAreasReviewedAt', coalesce(review.reviewed_at, now())
)
from public.evaluation_area_mapping_review review
where review.evaluation_id = evaluation.id
  and review.approved = true;

-- Conferência do que já foi efetivamente salvo nas avaliações.
select
  course_code,
  course_name,
  state -> 'mappedAreasByTitle' as mapped_areas,
  state ->> 'mappedAreasLabel' as display_value
from public.evaluations
where state ->> 'mappedAreasSource' = 'course_title_review'
order by course_name;
