-- Execute uma vez no SQL Editor do Supabase.
-- Permite atribuir uma área mapeada a uma avaliação concluída sem decisão de área.

begin;

create or replace function public.assign_evaluation_mapped_area(
  p_evaluation_id uuid,
  p_mapped_area text
)
returns table(evaluation_id uuid, mapped_area text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.evaluations%rowtype;
  allowed_areas constant text[] := array[
    'Desenvolvimento de software',
    'Redes e Infraestrutura',
    'Segurança Cibernética',
    'Cloud e DevOps',
    'Dados'
  ];
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;
  if not (p_mapped_area = any(allowed_areas)) then raise exception 'Área mapeada inválida.'; end if;

  select evaluation.* into target
  from public.evaluations evaluation
  where evaluation.id = p_evaluation_id and evaluation.status = 'concluida'
  for update;

  if target.id is null then raise exception 'Avaliação concluída não encontrada.'; end if;
  if lower(coalesce(target.final_result, '')) like '%fechar%'
     or lower(coalesce(target.final_result, '')) like '%troca de área%'
     or lower(coalesce(target.final_result, '')) like '%troca de area%'
     or lower(coalesce(target.state ->> 'changeType', '')) = 'troca_area' then
    raise exception 'Este desfecho não permite atribuição de área mapeada.';
  end if;

  insert into public.audit_events(entity_type,entity_id,action,old_data,new_data,actor_id)
  values('evaluation',target.id::text,'assign_mapped_area',to_jsonb(target),
    jsonb_build_object('mapped_area',p_mapped_area),auth.uid());

  update public.evaluations evaluation
  set state = coalesce(evaluation.state,'{}'::jsonb) || jsonb_build_object(
        'mappedAreasByTitle',jsonb_build_array(p_mapped_area),
        'mappedAreasLabel',p_mapped_area,
        'mappedAreaAssignedAt',now(),
        'mappedAreaAssignedBy',auth.uid()
      ),
      updated_at = now()
  where evaluation.id = target.id;

  return query select target.id,p_mapped_area;
end;
$$;

revoke all on function public.assign_evaluation_mapped_area(uuid,text) from public;
grant execute on function public.assign_evaluation_mapped_area(uuid,text) to authenticated;

commit;
