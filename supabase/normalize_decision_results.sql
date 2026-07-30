-- Normaliza grafias divergentes nos vereditos das análises.
-- Pode ser executado novamente com segurança.

begin;

update public.evaluations
set
  final_result = regexp_replace(
    final_result,
    '^RESTRUTURAR',
    'REESTRUTURAR',
    'i'
  ),
  updated_at = now()
where final_result ~* '^RESTRUTURAR';

commit;

-- Conferência dos resultados após a correção.
select
  final_result,
  count(*) as quantidade
from public.evaluations
where status = 'concluida'
group by final_result
order by final_result;
