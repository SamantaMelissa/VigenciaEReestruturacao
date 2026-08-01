begin;

create or replace function public.claim_pending_evaluation(p_course_code text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare target public.evaluations%rowtype;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;

  select evaluation.* into target
  from public.evaluations evaluation
  where evaluation.course_code = p_course_code and evaluation.status = 'rascunho'
  order by evaluation.updated_at desc limit 1 for update;

  if target.id is null then
    raise exception 'Esta análise não está mais disponível para assumir.';
  end if;

  if exists (
    select 1 from public.school_validations validation
    where validation.course_code = p_course_code
      and validation.status in ('pendente','em_contato')
  ) then
    raise exception 'Esta análise está em validação com a unidade.';
  end if;

  update public.evaluations
  set created_by = auth.uid(), status = 'em_analise', updated_at = now()
  where id = target.id;

  return target.id;
end;
$$;

revoke all on function public.claim_pending_evaluation(text) from public;
grant execute on function public.claim_pending_evaluation(text) to authenticated;

create or replace function public.claim_ready_evaluation(p_course_code text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare target_id uuid;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;
  select evaluation.id into target_id from public.evaluations evaluation
  where evaluation.course_code=p_course_code and evaluation.status in ('rascunho','em_analise')
    and lower(coalesce(evaluation.state ->> 'validationReady','false'))='true'
  order by evaluation.updated_at desc limit 1 for update;
  if target_id is null then raise exception 'Este retorno já foi assumido por outro usuário.'; end if;
  update public.evaluations evaluation set created_by=auth.uid(),status='em_analise',
    state=jsonb_set(coalesce(evaluation.state,'{}'::jsonb),'{validationReady}','false'::jsonb,true),updated_at=now()
  where evaluation.id=target_id;
  return target_id;
end;
$$;
revoke all on function public.claim_ready_evaluation(text) from public;
grant execute on function public.claim_ready_evaluation(text) to authenticated;

commit;
