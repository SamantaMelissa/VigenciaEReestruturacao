-- Execute uma vez no SQL Editor do Supabase.
-- Reabre uma avaliação concluída sem criar outro registro para o mesmo curso.

begin;

create or replace function public.reopen_completed_evaluation(p_evaluation_id uuid)
returns table(evaluation_id uuid, course_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.evaluations%rowtype;
  clean_state jsonb;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select evaluation.* into target
  from public.evaluations evaluation
  where evaluation.id = p_evaluation_id
    and evaluation.status = 'concluida'
  for update;

  if target.id is null then
    raise exception 'Avaliação concluída não encontrada.';
  end if;

  clean_state := jsonb_build_object(
    'answers', '[]'::jsonb,
    'decisionPath', '[]'::jsonb,
    'questionObservations', '{}'::jsonb,
    'scenarioSelections', '{}'::jsonb,
    'enrollments', coalesce(target.state -> 'enrollments', '{}'::jsonb),
    'units', coalesce(target.state -> 'units', '[]'::jsonb),
    'source', 'Reavaliação solicitada no sistema',
    'reopenedAt', now(),
    'reopenedBy', auth.uid()
  );

  insert into public.audit_events (
    entity_type, entity_id, action, old_data, new_data, actor_id
  ) values (
    'evaluation', target.id::text, 'reopen_for_reevaluation', to_jsonb(target),
    jsonb_build_object('status', 'rascunho', 'course_code', target.course_code), auth.uid()
  );

  delete from public.evaluation_answers answer
  where answer.evaluation_id = target.id;

  update public.evaluations evaluation
  set status = 'rascunho',
      current_question = 1,
      final_result = null,
      justification = null,
      state = clean_state,
      created_by = auth.uid(),
      completed_at = null,
      updated_at = now()
  where evaluation.id = target.id;

  return query select target.id, target.course_code;
end;
$$;

revoke all on function public.reopen_completed_evaluation(uuid) from public;
grant execute on function public.reopen_completed_evaluation(uuid) to authenticated;

commit;

