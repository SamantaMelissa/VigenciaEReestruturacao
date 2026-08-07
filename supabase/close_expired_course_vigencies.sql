-- Registra no banco os cursos GED cuja data de término já venceu.
-- Execute uma vez no SQL Editor do Supabase.
-- O script é idempotente e mantém backup dos registros alterados.

begin;

create table if not exists public.expired_course_vigencies (
  course_code text primary key,
  course_name text not null,
  criterion_key text not null,
  end_date date not null,
  updated_at timestamptz not null default now()
);

alter table public.expired_course_vigencies enable row level security;

insert into public.expired_course_vigencies (course_code, course_name, criterion_key, end_date) values
('66551', 'ADMINISTRADOR DE BANCO DE DADOS', 'regular', date '2023-11-29'),
('87784', 'ADMINISTRADOR DE SERVIDORES WINDOWS', 'fic', date '2023-12-31'),
('54575', 'AUTO CAD 2D', 'fic', date '2025-12-31'),
('54578', 'AUTO CAD 3D', 'fic', date '2025-12-31'),
('84583', 'AUTOCAD 2D/3D', 'fic', date '2025-12-31'),
('78394', 'COMPETÊNCIA TRANSVERSAL - LÓGICA DE PROGRAMAÇÃO', 'fic', date '2021-06-01'),
('106210', 'COMPUTAÇÃO QUÂNTICA', 'regular', date '2024-11-01'),
('82998', 'DESENHISTA DE PÁGINAS PARA WEB (WEB DESIGNER)', 'regular', date '2024-05-10'),
('99732', 'DESIGN PARA JOGOS DIGITAIS', 'fic', date '2024-12-06'),
('90692', 'FUNDAMENTOS DE BIG DATA E DATA ANALYTICS COM PYTHON', 'fic', date '2024-11-20'),
('100904', 'FUNDAMENTOS DE POWER PLATFORM - MICROSOFT - PL-900', 'fic', date '2024-12-30'),
('54433', 'INFORMÁTICA BÁSICA', 'fic', date '2021-12-10'),
('54580', 'INSTALAÇÃO DE INFRAESTRUTURA PARA REDE DE COMPUTADORES', 'fic', date '2023-12-31'),
('54571', 'INSTALAÇÃO DE REDES ÓPTICAS', 'fic', date '2023-12-31'),
('92309', 'LÓGICA DE PROGRAMAÇÃO', 'fic', date '2025-03-10'),
('92661', 'POWER BI', 'fic', date '2025-01-30'),
('95402', 'PROGRAMADOR FRONT-END', 'regular', date '2024-05-30'),
('100529', 'PROGRAMADOR FULL STACK', 'regular', date '2023-12-30'),
('54604', 'PROGRAMAÇÃO C#', 'fic', date '2025-01-01'),
('54712', 'PROGRAMAÇÃO DE BANCO DE DADOS', 'fic', date '2024-01-07'),
('102736', 'PROGRAMAÇÃO EM PHYTON', 'fic', date '2023-11-27'),
('97486', 'PROGRAMAÇÃO EM PYTHON', 'fic', date '2024-10-05'),
('101561', 'PROGRAMAÇÃO EM R PARA DATA SCIENCE', 'fic', date '2024-04-30'),
('87474', 'REALIDADE AUMENTADA', 'fic', date '2024-01-03'),
('87475', 'REALIDADE VIRTUAL', 'fic', date '2023-12-27'),
('87774', 'REDES DE COMPUTADORES - IMPLANTAÇÃO DE REDES LOCAIS', 'fic', date '2024-12-31'),
('88656', 'SOLUÇÕES INTEGRADAS COM IOT', 'fic', date '2024-12-31'),
('103352', 'TÉCNICO EM CIBERSEGURANÇA', 'regular', date '2024-02-23'),
('99517', 'TÉCNICO EM DESENVOLVIMENTO DE SISTEMAS', 'regular', date '2024-12-30'),
('99222', 'TÉCNICO EM DESENVOLVIMENTO DE SISTEMAS', 'regular', date '2025-12-30'),
('85566', 'TÉCNICO EM DESENVOLVIMENTO DE SISTEMAS', 'regular', date '2023-06-21'),
('97016', 'TÉCNICO EM DESENVOLVIMENTO DE SISTEMAS', 'regular', date '2025-10-09'),
('97012', 'TÉCNICO EM DESENVOLVIMENTO DE SISTEMAS', 'regular', date '2024-06-30'),
('92705', 'TÉCNICO EM PROGRAMAÇÃO DE JOGOS DIGITAIS', 'regular', date '2025-12-30'),
('94704', 'TÉCNICO EM REDES DE COMPUTADORES', 'regular', date '2024-12-30'),
('99493', 'TÉCNICO EM REDES DE COMPUTADORES', 'regular', date '2024-12-31'),
('85673', 'TÉCNICO EM REDES DE COMPUTADORES', 'regular', date '2022-12-31')
on conflict (course_code) do update set
  course_name = excluded.course_name,
  criterion_key = excluded.criterion_key,
  end_date = excluded.end_date,
  updated_at = now();

create table if not exists public.evaluations_expired_backup_20260807
as select * from public.evaluations where false;

create table if not exists public.evaluation_answers_expired_backup_20260807
as select * from public.evaluation_answers where false;

insert into public.evaluations_expired_backup_20260807
select evaluation.*
from public.evaluations evaluation
where exists (select 1 from public.expired_course_vigencies source where source.course_code = evaluation.course_code)
  and not exists (select 1 from public.evaluations_expired_backup_20260807 backup where backup.id = evaluation.id);

insert into public.evaluation_answers_expired_backup_20260807
select answer.*
from public.evaluation_answers answer
join public.evaluations evaluation on evaluation.id = answer.evaluation_id
where exists (select 1 from public.expired_course_vigencies source where source.course_code = evaluation.course_code)
  and not exists (select 1 from public.evaluation_answers_expired_backup_20260807 backup where backup.id = answer.id);

do $$
declare
  actor_id uuid;
  item record;
  target_id uuid;
  criterion_label_value text;
  end_date_label text;
begin
  select profile.id into actor_id
  from public.profiles profile
  order by case profile.role when 'admin' then 0 when 'gestor' then 1 else 2 end, profile.created_at
  limit 1;

  if actor_id is null then
    raise exception 'Crie ao menos um perfil de usuário antes de executar esta migração.';
  end if;

  for item in select * from public.expired_course_vigencies order by course_code loop
    criterion_label_value := case when item.criterion_key = 'fic'
      then 'Critério FIC — Aperfeiçoamento, Especialização e Iniciação'
      else 'Critério Regular / Qualificação'
    end;
    end_date_label := to_char(item.end_date, 'DD/MM/YYYY');

    select evaluation.id into target_id
    from public.evaluations evaluation
    where evaluation.course_code = item.course_code
    order by case when evaluation.status in ('rascunho', 'em_analise') then 0 else 1 end,
             evaluation.updated_at desc
    limit 1
    for update;

    if target_id is null then
      insert into public.evaluations (
        course_code, course_name, criterion_key, criterion_label, status,
        current_question, final_result, justification, state, created_by, completed_at
      ) values (
        item.course_code, item.course_name, item.criterion_key, criterion_label_value, 'concluida',
        null, 'FECHAR A VIGÊNCIA',
        format('Fechar a vigência porque a data de término registrada para o curso é %s.', end_date_label),
        jsonb_build_object(
          'sourceId', 'vigencia-expirada-' || item.course_code,
          'source', 'Data de término da base de cursos',
          'changeType', 'fechar_vigencia_data_termino',
          'closureReason', 'vigencia_expirada',
          'closureReasonLabel', 'Vigência expirada em ' || end_date_label,
          'endDate', end_date_label,
          'answers', '[]'::jsonb,
          'decisionPath', jsonb_build_array(jsonb_build_object(
            'step', 1,
            'text', 'A vigência do curso expirou em ' || end_date_label,
            'answer', null,
            'observation', 'Fechamento registrado automaticamente pela data de término.'
          ))
        ),
        actor_id, now()
      ) returning id into target_id;
    else
      update public.evaluations evaluation
      set course_name = item.course_name,
          criterion_key = item.criterion_key,
          criterion_label = criterion_label_value,
          status = 'concluida',
          current_question = null,
          final_result = 'FECHAR A VIGÊNCIA',
          justification = format('Fechar a vigência porque a data de término registrada para o curso é %s.', end_date_label),
          state = coalesce(evaluation.state, '{}'::jsonb) || jsonb_build_object(
            'sourceId', 'vigencia-expirada-' || item.course_code,
            'source', 'Data de término da base de cursos',
            'changeType', 'fechar_vigencia_data_termino',
            'closureReason', 'vigencia_expirada',
            'closureReasonLabel', 'Vigência expirada em ' || end_date_label,
            'endDate', end_date_label,
            'answers', '[]'::jsonb,
            'decisionPath', jsonb_build_array(jsonb_build_object(
              'step', 1,
              'text', 'A vigência do curso expirou em ' || end_date_label,
              'answer', null,
              'observation', 'Fechamento registrado automaticamente pela data de término.'
            ))
          ),
          completed_at = now(),
          updated_at = now()
      where evaluation.id = target_id;
    end if;

    delete from public.evaluation_answers answer where answer.evaluation_id = target_id;

    update public.school_validations validation
    set status = 'concluido',
        notes = concat_ws(E'\n', nullif(validation.notes, ''), 'Encerrada automaticamente: vigência expirada em ' || end_date_label),
        concluded_at = coalesce(validation.concluded_at, now()),
        updated_at = now()
    where validation.course_code = item.course_code
      and validation.status in ('pendente', 'em_contato');

    update public.course_analysis_scope scope
    set is_analyzable = false, updated_at = now()
    where scope.course_code = item.course_code;

    insert into public.audit_events (entity_type, entity_id, action, new_data, actor_id)
    select 'evaluation', target_id::text, 'closed_expired_vigency',
           jsonb_build_object('course_code', item.course_code, 'end_date', end_date_label), actor_id
    where not exists (
      select 1 from public.audit_events audit
      where audit.entity_type = 'evaluation'
        and audit.entity_id = target_id::text
        and audit.action = 'closed_expired_vigency'
    );
  end loop;
end;
$$;

select evaluation.course_code, evaluation.course_name, evaluation.final_result,
       evaluation.state ->> 'closureReason' as closure_reason,
       evaluation.state ->> 'endDate' as end_date
from public.evaluations evaluation
where evaluation.state ->> 'closureReason' = 'vigencia_expirada'
order by evaluation.course_name;

commit;
