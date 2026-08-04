-- Restringe o retorno da escola a gestores e administradores.
-- Execute uma vez no SQL Editor antes de publicar o frontend correspondente.

begin;

drop policy if exists "Authenticated users update validations" on public.school_validations;
drop policy if exists "Managers update validations" on public.school_validations;
create policy "Managers update validations"
on public.school_validations for update to authenticated
using (public.current_user_role() in ('gestor', 'admin'))
with check (public.current_user_role() in ('gestor', 'admin'));

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
  if public.current_user_role() not in ('gestor', 'admin') then
    raise exception 'Somente gestores podem registrar o retorno da escola.';
  end if;

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
        'awaitingSchoolValidation',false,'returnedFromContact',true,'validationReady',p_positive
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
        'awaitingSchoolValidation',false,'returnedFromContact',true,'validationReady',p_positive
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

commit;

notify pgrst, 'reload schema';
