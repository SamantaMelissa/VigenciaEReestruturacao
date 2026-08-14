-- Acesso às propostas sem regras de autoria: todos podem ver e editar;
-- exclusão (status 'cancelada') somente para gestor/admin ou o autor.
--
-- Execute uma vez no SQL Editor em bancos que já possuem
-- enable_course_proposals.sql (e cancelamento) aplicado. Idempotente.
-- Para bancos novos, a versão atual de enable_course_proposals.sql já
-- contém esse comportamento.
--
-- Pré-requisito: a leitura aberta a todos já está em
-- open_proposals_read_access.sql (política "All authenticated users view
-- proposals"). Esta migração ajusta apenas edição e exclusão.

begin;

drop policy if exists "Users edit own active proposals" on public.course_proposals;
drop policy if exists "Users edit editable own proposals" on public.course_proposals;
drop policy if exists "Users cancel own proposals" on public.course_proposals;
drop policy if exists "Managers update proposals" on public.course_proposals;

create policy "All authenticated users edit proposals"
on public.course_proposals for update to authenticated
using (true)
with check (true);

drop policy if exists "Managers delete proposals" on public.course_proposals;

create policy "Creators and managers delete proposals"
on public.course_proposals for delete to authenticated
using (created_by = auth.uid() or public.current_user_role() in ('gestor', 'admin'));

commit;

-- Conferência das políticas.
select tablename, policyname, cmd, permissive
from pg_policies
where schemaname = 'public'
  and tablename = 'course_proposals'
order by cmd;