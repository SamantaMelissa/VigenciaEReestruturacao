-- Execute uma vez no SQL Editor do Supabase.
-- Permite atribuir uma área mapeada a uma avaliação concluída sem decisão de área.

begin;

drop function if exists public.assign_evaluation_mapped_area(uuid,text);

create or replace function public.assign_evaluation_mapped_areas(
  p_evaluation_id uuid,
  p_mapped_areas text[]
)
returns table(evaluation_id uuid, mapped_areas text[])
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
  selected_areas text[];
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;
  select array_agg(distinct area) into selected_areas from unnest(coalesce(p_mapped_areas,'{}'::text[])) area;
  if coalesce(cardinality(selected_areas),0)=0
     or exists(select 1 from unnest(selected_areas) area where not (area=any(allowed_areas))) then
    raise exception 'Seleção de áreas mapeadas inválida.';
  end if;

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
  values('evaluation',target.id::text,'assign_mapped_areas',to_jsonb(target),
    jsonb_build_object('mapped_areas',to_jsonb(selected_areas)),auth.uid());

  update public.evaluations evaluation
  set state = coalesce(evaluation.state,'{}'::jsonb) || jsonb_build_object(
        'mappedAreasByTitle',to_jsonb(selected_areas),
        'mappedAreasLabel',array_to_string(selected_areas,'; '),
        'mappedAreaAssignedAt',now(),
        'mappedAreaAssignedBy',auth.uid()
      ),
      updated_at = now()
  where evaluation.id = target.id;

  return query select target.id,selected_areas;
end;
$$;

revoke all on function public.assign_evaluation_mapped_areas(uuid,text[]) from public;
grant execute on function public.assign_evaluation_mapped_areas(uuid,text[]) to authenticated;

-- Compatibilidade com versões anteriores do frontend ainda armazenadas em cache.
create or replace function public.assign_evaluation_mapped_area(p_evaluation_id uuid,p_mapped_area text)
returns table(evaluation_id uuid,mapped_area text)
language sql
security definer
set search_path=public
as $$
  select assigned.evaluation_id,p_mapped_area
  from public.assign_evaluation_mapped_areas(p_evaluation_id,array[p_mapped_area]) assigned;
$$;
revoke all on function public.assign_evaluation_mapped_area(uuid,text) from public;
grant execute on function public.assign_evaluation_mapped_area(uuid,text) to authenticated;

notify pgrst,'reload schema';

commit;
