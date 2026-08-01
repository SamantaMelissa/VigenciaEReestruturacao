-- Execute uma vez no SQL Editor do Supabase antes de publicar este frontend.
-- Disponibiliza retornos positivos para qualquer avaliador e garante que apenas
-- uma pessoa consiga assumir cada avaliação.

drop function if exists public.list_active_evaluation_claims();

create function public.list_active_evaluation_claims()
returns table(
  course_code text,
  created_by uuid,
  status public.evaluation_status,
  updated_at timestamptz,
  available_for_claim boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select evaluation.course_code, evaluation.created_by, evaluation.status, evaluation.updated_at,
    lower(coalesce(evaluation.state ->> 'validationReady', 'false')) = 'true'
  from public.evaluations evaluation
  where evaluation.status in ('rascunho', 'em_analise');
$$;

revoke all on function public.list_active_evaluation_claims() from public;
grant execute on function public.list_active_evaluation_claims() to authenticated;

create or replace function public.apply_school_validation_return(
  p_validation_id uuid,
  p_positive boolean,
  p_trail jsonb
)
returns table(evaluation_id uuid, evaluation_status public.evaluation_status, next_question integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  validation public.school_validations%rowtype;
  target_evaluation public.evaluations%rowtype;
  calculated_next integer;
  calculated_status public.evaluation_status;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;

  select * into validation from public.school_validations
  where id = p_validation_id for update;
  if not found then raise exception 'Validação não encontrada.'; end if;

  select * into target_evaluation from public.evaluations
  where course_code = validation.course_code and status in ('rascunho', 'em_analise')
  order by updated_at desc limit 1 for update;

  if target_evaluation.id is null and validation.evaluation_id is not null then
    select * into target_evaluation from public.evaluations
    where id = validation.evaluation_id for update;
  end if;

  calculated_next := case when validation.criterion_key = 'fic' then 6 else 7 end;
  calculated_status := case when p_positive then 'rascunho'::public.evaluation_status else 'concluida'::public.evaluation_status end;

  if target_evaluation.id is null then
    insert into public.evaluations(
      course_code,course_name,criterion_key,criterion_label,status,current_question,
      final_result,justification,state,created_by,completed_at
    ) values (
      validation.course_code,validation.course_name,validation.criterion_key,validation.criterion_label,calculated_status,
      case when p_positive then calculated_next else null end,
      case when p_positive then null else 'FECHAR A VIGÊNCIA' end,
      case when p_positive then null else 'A unidade não apresentou justificativa técnica para manter o curso. Diante do retorno registrado na Central de Validações, recomenda-se fechar a vigência.' end,
      jsonb_build_object(
        'answers',coalesce(p_trail,'[]'::jsonb),'decisionPath',coalesce(p_trail,'[]'::jsonb),
        'enrollments',validation.enrollments,'units',validation.units,
        'returnedFromContact',true,'validationReady',p_positive
      ),
      auth.uid(),case when p_positive then null else now() end
    ) returning * into target_evaluation;
  else
    update public.evaluations set
      status=calculated_status,
      current_question=case when p_positive then calculated_next else null end,
      final_result=case when p_positive then null else 'FECHAR A VIGÊNCIA' end,
      justification=case when p_positive then null else 'A unidade não apresentou justificativa técnica para manter o curso. Diante do retorno registrado na Central de Validações, recomenda-se fechar a vigência.' end,
      completed_at=case when p_positive then null else now() end,
      state=coalesce(state,'{}'::jsonb)||jsonb_build_object(
        'answers',coalesce(p_trail,'[]'::jsonb),'decisionPath',coalesce(p_trail,'[]'::jsonb),
        'enrollments',validation.enrollments,'units',validation.units,
        'returnedFromContact',true,'validationReady',p_positive
      )
    where id=target_evaluation.id returning * into target_evaluation;
  end if;

  update public.school_validations set evaluation_id=target_evaluation.id
  where id=validation.id;

  return query select target_evaluation.id,target_evaluation.status,
    case when p_positive then calculated_next else null end;
end;
$$;

revoke all on function public.apply_school_validation_return(uuid, boolean, jsonb) from public;
grant execute on function public.apply_school_validation_return(uuid, boolean, jsonb) to authenticated;

create or replace function public.claim_ready_evaluation(p_course_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;

  select evaluation.id into target_id
  from public.evaluations evaluation
  where evaluation.course_code = p_course_code
    and evaluation.status in ('rascunho', 'em_analise')
    and lower(coalesce(evaluation.state ->> 'validationReady', 'false')) = 'true'
  order by evaluation.updated_at desc
  limit 1
  for update;

  if target_id is null then
    raise exception 'Este retorno já foi assumido por outro usuário.';
  end if;

  update public.evaluations evaluation
  set created_by = auth.uid(),
      status = 'em_analise',
      state = jsonb_set(coalesce(evaluation.state, '{}'::jsonb), '{validationReady}', 'false'::jsonb, true),
      updated_at = now()
  where evaluation.id = target_id;

  return target_id;
end;
$$;

revoke all on function public.claim_ready_evaluation(text) from public;
grant execute on function public.claim_ready_evaluation(text) to authenticated;

-- Recupera retornos positivos registrados antes da criação desta funcionalidade.
-- Somente avaliações ainda abertas e ligadas diretamente ao contato são liberadas.
update public.evaluations evaluation
set state = jsonb_set(
      coalesce(evaluation.state, '{}'::jsonb),
      '{validationReady}',
      'true'::jsonb,
      true
    ),
    updated_at = now()
from public.school_validations validation
where validation.evaluation_id = evaluation.id
  and validation.school_answer is true
  and validation.status = 'concluido'
  and evaluation.status in ('rascunho', 'em_analise')
  and lower(coalesce(evaluation.state ->> 'validationReady', 'false')) <> 'true';

notify pgrst, 'reload schema';
