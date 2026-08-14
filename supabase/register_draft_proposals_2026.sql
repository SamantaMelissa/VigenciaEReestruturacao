-- Registro das propostas de GRADUAÇÃO / MBA / PÓS-GRADUAÇÃO (2026).
--
-- Decisão do Fábrica de Cursos: a carga horária não é necessária para o
-- registro da proposta — ela será definida somente depois que a pesquisa
-- pública validar o curso. Portanto, as 24 formações acadêmicas que
-- entraram como 'rascunho' na carga seed_course_proposals_2026.sql passam
-- para 'submetida' (exibida como "Registrada"), mantendo workload_hours nulo.
--
-- Justificativas curtas também são substituídas por texto público:
--   * "SOLICITAÇÃO CENTRO UNIVERSITÁRIO" -> texto descrevendo a solicitação.
--   * "MAGNO APAGOU" (Engenharia de Software) -> texto genérico de demanda.
-- As demais justificativas são preservadas.
--
-- O gatilho protect_course_proposal_transition só permite troca de status
-- por gestor/admin; no SQL Editor current_user_role() é nulo (sem sessão
-- autenticada), então o gatilho é desabilitado dentro desta transação e
-- reabilitado no commit. Como o ALTER TABLE é transacional, qualquer erro
-- reverte a transação e o gatilho permanece ativo.
--
-- Execute pelo Supabase SQL Editor. Idempotente: só altera registros que
-- ainda estejam com status 'rascunho' e com título desta carga.

begin;

do $$
begin
  if not exists (select 1 from public.profiles where role in ('admin', 'gestor')) then
    raise exception 'Crie um perfil admin ou gestor antes de executar esta migração.';
  end if;
end;
$$;

alter table public.course_proposals
  disable trigger course_proposals_protect_transition;

with targets(title) as (
  values
    ('Bacharelado em Ciência de Dados e Inteligência Artificial'),
    ('Tecnologia em Análise e Desenvolvimento de Sistemas – Semipresencial'),
    ('Tecnologia em Segurança Cibernética'),
    ('Engenharia de Software'),
    ('Engenharia de Computação'),
    ('Tecnologia em Jogos Digitais'),
    ('Transformação Digital'),
    ('Cybersecurity e Gestão de Riscos'),
    ('Data-Driven Business / Business Analytics'),
    ('Executivo em IA e Tecnologias Emergentes para Negócios'),
    ('Product Management'),
    ('Cloud & DevSecOps'),
    ('Cyber Security IT/OT: Defesa e Ofensiva'),
    ('Inteligência Artificial (reformular)'),
    ('Simulação Virtual e Gêmeos Digitais'),
    ('Engenharia de Dados & Big Data'),
    ('Arquitetura de Soluções em Nuvem (AWS/Azure/GCP)'),
    ('MLOps e Engenharia de Machine Learning'),
    ('Governança, Risco e Compliance (GRC)'),
    ('Blockchain'),
    ('UI/UX e Design de Produtos Digitais'),
    ('DevSecOps e Infraestrutura Híbrida'),
    ('Governança, Riscos e Resiliência Cibernética'),
    ('FullStack')
)
update public.course_proposals p
set status = 'submetida',
    justification = case
      when p.justification = 'SOLICITAÇÃO CENTRO UNIVERSITÁRIO'
        then 'Solicitação do Centro Universitário para a oferta desta formação.'
      when p.justification = 'MAGNO APAGOU'
        then 'Formação solicitada para atender à demanda do setor de TIC; o detalhamento curricular e a carga horária serão definidos posteriormente.'
      else p.justification
    end
from targets t
where lower(p.title) = lower(t.title)
  and p.status = 'rascunho';

alter table public.course_proposals
  enable trigger course_proposals_protect_transition;

commit;

-- Conferência da migração.
select status, count(*) as quantidade
from public.course_proposals
group by status
order by status;