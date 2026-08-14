-- Acesso de leitura às propostas para todos os usuários autenticados.
--
-- Decisão do Fábrica de Cursos: qualquer usuário autenticado pode visualizar
-- todas as propostas de cursos, seus documentos e seu histórico. As regras de
-- gestão (editar, excluir, cancelar) permanecem restritas ao autor e aos
-- perfis gestor/admin e serão definidas em migração posterior.
--
-- Idempotente: apenas recria as políticas de SELECT (view).

begin;

drop policy if exists "Users view own proposals and managers view all" on public.course_proposals;
create policy "All authenticated users view proposals"
on public.course_proposals for select to authenticated
using (true);

drop policy if exists "Users view proposal documents" on public.course_proposal_documents;
create policy "All authenticated users view proposal documents"
on public.course_proposal_documents for select to authenticated
using (true);

drop policy if exists "Users view proposal history" on public.course_proposal_events;
create policy "All authenticated users view proposal history"
on public.course_proposal_events for select to authenticated
using (true);

commit;

-- Conferência das políticas.
select tablename, policyname, cmd, permissive
from pg_policies
where schemaname = 'public'
  and tablename in ('course_proposals', 'course_proposal_documents', 'course_proposal_events')
order by tablename, cmd;
