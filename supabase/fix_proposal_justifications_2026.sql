-- Ajuste das justificativas geradas na carga de 2026.
--
-- Decisão do Fábrica de Cursos: remover a menção à validação da pesquisa
-- pública dos textos gerados automaticamente.
--   * "SOLICITAÇÃO CENTRO UNIVERSITÁRIO" -> "Solicitação do Centro
--     Universitário para a oferta desta formação."
--   * "MAGNO APAGOU" -> "Formação solicitada para atender à demanda do
--     setor de TIC; o detalhamento curricular e a carga horária serão
--     definidos posteriormente."
--
-- Idempotente: só atualiza registros que ainda contenham os textos antigos.
-- Não altera status, portanto o gatilho de transição não é acionado.

begin;

update public.course_proposals
set justification = 'Solicitação do Centro Universitário para a oferta desta formação.',
    updated_at = now()
where justification = 'Solicitação do Centro Universitário para a oferta desta formação; a carga horária e o detalhamento curricular serão definidos após a validação da pesquisa pública.';

update public.course_proposals
set justification = 'Formação solicitada para atender à demanda do setor de TIC; o detalhamento curricular e a carga horária serão definidos posteriormente.',
    updated_at = now()
where justification = 'Formação solicitada para atender à demanda do setor de TIC; o detalhamento curricular e a carga horária serão definidos após a validação da pesquisa pública.';

commit;

-- Conferência: nenhuma proposta deve conter "pesquisa pública".
select count(*) as com_menção_pesquisa
from public.course_proposals
where justification ilike '%pesquisa pública%';