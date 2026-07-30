-- Ajustes necessários para a integração do frontend com o Supabase.
-- Execute uma vez depois de schema.sql.

drop policy if exists "Authenticated users can view evaluations"
on public.evaluations;

drop policy if exists "Authenticated users can view permitted evaluations"
on public.evaluations;

create policy "Authenticated users can view permitted evaluations"
on public.evaluations for select to authenticated
using (
  status = 'concluida'
  or created_by = auth.uid()
  or public.current_user_role() in ('gestor', 'admin')
);

drop policy if exists "Owners delete own unfinished evaluations"
on public.evaluations;

create policy "Owners delete own unfinished evaluations"
on public.evaluations for delete to authenticated
using (
  created_by = auth.uid()
  and status in ('rascunho', 'em_analise')
);

-- Confirma que as tabelas continuam protegidas.
select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'profiles',
    'evaluations',
    'evaluation_answers',
    'school_validations',
    'audit_events'
  )
order by tablename;
