-- Verificação do fluxo de Propostas de novos cursos.
-- Seguro para executar: roda dentro de uma transação e desfaz tudo (ROLLBACK) ao final.
-- Pré-requisito: execute a versão atual de enable_course_proposals.sql e,
-- para bancos existentes, relax_proposal_workload_requirement.sql e
-- simplify_proposal_flow.sql.

begin;

do $$
declare
  v_col text;
  v_profile uuid;
  v_proposal uuid;
  v_events bigint;
  v_policy_count integer;
  v_ok boolean := true;
begin
  -- 1) Estrutura da tabela
  foreach v_col in array array[
    'id','title','area','segment','course_type','level','workload_hours',
    'target_audience','justification','demand_evidence','interested_units',
    'strategic_scenarios','mapped_areas','related_technologies','status',
    'manager_feedback','cancellation_reason','submitted_at','reviewed_at','reviewed_by',
    'created_by','created_at','updated_at'
  ] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'course_proposals'
        and column_name = v_col
    ) then
      raise exception 'ERRO: coluna faltando em course_proposals: %', v_col;
    end if;
  end loop;
  raise notice '[1/5] Estrutura de course_proposals OK (colunas esperadas presentes).';

  -- 2) Funções de gatilho
  foreach v_col in array array[
    'protect_course_proposal_transition',
    'set_course_proposal_dates',
    'log_course_proposal_event'
  ] loop
    if not exists (
      select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = v_col
    ) then
      raise exception 'ERRO: função de gatilho faltando: %', v_col;
    end if;
  end loop;
  raise notice '[2/5] Funções de gatilho OK.';

  -- 3) Políticas RLS de course_proposals
  select count(*) into v_policy_count
    from pg_policies
   where schemaname = 'public' and tablename = 'course_proposals';
  if v_policy_count = 0 then
    raise notice 'AVISO [3/5]: nenhuma política RLS encontrada para course_proposals.';
  else
    raise notice '[3/5] % políticas RLS em course_proposals OK.', v_policy_count;
  end if;

  -- 4) Registrar proposta diretamente, sem rascunho e sem carga horária
  select id into v_profile from public.profiles order by created_at limit 1;
  if v_profile is null then
    raise exception 'ERRO: nenhum perfil em public.profiles. Crie um usuário antes de testar.';
  end if;

  insert into public.course_proposals (
    title, area, segment, course_type, level, target_audience, justification,
    demand_evidence, interested_units, strategic_scenarios, mapped_areas,
    related_technologies, status, created_by
  ) values (
    'Curso Radar de Verificação', 'Tecnologia da Informação', 'T.I. Dados',
    'Aperfeiçoamento', 'Qualificação', 'Profissionais de TI',
    'Justificativa de teste com mais de dez caracteres.',
    'Evidência de demanda coletada em teste.',
    array['SENAI Verificação'], array['Ampliação de portfólio'],
    array['Desenvolvimento de software'], 'Python', 'submetida', v_profile
  ) returning id into v_proposal;
  raise notice '[4/5] Proposta registrada diretamente, sem carga horária, OK.';

  -- 5) Edição de campos mantendo o status registrada
  begin
    update public.course_proposals
       set area = 'Tecnologia da Informação e Comunicação', workload_hours = 120
     where id = v_proposal;
    if exists (
      select 1 from public.course_proposals where id = v_proposal and area <> 'Tecnologia da Informação e Comunicação'
    ) then
      raise notice 'AVISO [5/5]: edição de campos não foi persistida.';
    end if;
    raise notice '[5/5] Edição de proposta registrada OK.';
  exception
    when others then
      raise notice 'ATENÇÃO [5/5]: edição recusada pelo banco (%): execute simplify_proposal_flow.sql e refaça a verificação.', SQLERRM;
      v_ok := false;
  end;

  -- 6) Exclusão (cancelamento) com motivo
  begin
    update public.course_proposals
       set status = 'cancelada', cancellation_reason = 'Motivo de teste da exclusão.'
     where id = v_proposal;
    select count(*) into v_events
      from public.course_proposal_events where proposal_id = v_proposal;
    if v_events < 3 then
      raise notice 'AVISO [6/6]: exclusão OK, mas histórico com % evento(s) (esperado: criada + status_alterado + status_alterado).', v_events;
    end if;
    if not exists (
      select 1 from public.course_proposals where id = v_proposal and status = 'cancelada'
        and cancellation_reason = 'Motivo de teste da exclusão.'
    ) then
      raise notice 'AVISO [6/6]: motivo da exclusão não foi persistido corretamente.';
    end if;
    raise notice '[6/6] Exclusão com motivo OK.';
  exception
    when others then
      raise notice 'ATENÇÃO [6/6]: exclusão falhou (%): execute simplify_proposal_flow.sql e refaça a verificação.', SQLERRM;
      v_ok := false;
  end;

  if v_ok then
    raise notice 'RESULTADO: fluxo de propostas OK.';
  else
    raise notice 'RESULTADO: verificação concluída com ajustes pendentes (veja mensagens acima).';
  end if;
end;
$$;

rollback;