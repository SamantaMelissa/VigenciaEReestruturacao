-- Execute uma vez no SQL Editor do Supabase antes de publicar o frontend.
-- Impede que dois avaliadores reservem o mesmo curso simultaneamente.

do $$
begin
  if exists (
    select 1
    from public.evaluations
    where status in ('rascunho', 'em_analise')
    group by course_code
    having count(*) > 1
  ) then
    raise exception 'Existem cursos com mais de uma análise ativa. Resolva essas duplicidades antes de ativar o bloqueio.';
  end if;
end
$$;

create unique index if not exists evaluations_one_active_per_course_idx
on public.evaluations(course_code)
where status in ('rascunho', 'em_analise');

create or replace function public.list_active_evaluation_claims()
returns table(course_code text, created_by uuid, status public.evaluation_status, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select evaluation.course_code, evaluation.created_by, evaluation.status, evaluation.updated_at
  from public.evaluations evaluation
  where evaluation.status in ('rascunho', 'em_analise');
$$;

revoke all on function public.list_active_evaluation_claims() from public;
grant execute on function public.list_active_evaluation_claims() to authenticated;
