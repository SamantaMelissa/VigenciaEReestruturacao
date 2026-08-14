# Configuração do Supabase

## 1. Criar o banco

1. Abra o projeto no Supabase.
2. Entre em **SQL Editor**.
3. Clique em **New query**.
4. Copie todo o conteúdo de `schema.sql`.
5. Clique em **Run**.

O script cria as tabelas, índices, gatilhos e políticas de segurança.

## 2. Configurar autenticação

Em **Authentication > Providers**, mantenha habilitado **Email**.

Para evitar cadastro público, desabilite a criação aberta de usuários e crie os
usuários em **Authentication > Users**. Todo usuário novo recebe inicialmente o
perfil `avaliador`.

O acesso é restrito a e-mails institucionais `@sp.senai.br`, validado no
frontend (atributo `pattern` e função `isAllowedEmail` em
`supabase-service.js`). Crie os usuários somente com esse domínio e não mude a
validação sem alinhar os dois pontos.

## 3. Definir o primeiro administrador

Depois de criar seu próprio usuário, execute no SQL Editor:

```sql
-- O primeiro administrador pode ser criado diretamente pelo SQL Editor.
update public.profiles
set role = 'admin'
where id = (
  select id from auth.users where email = 'SEU_EMAIL_AQUI'
);
```

Os perfis disponíveis são `avaliador`, `gestor` e `admin`.

## 4. Obter os dados públicos de conexão

No painel do projeto, abra **Connect** ou **Settings > API Keys** e copie:

- Project URL;
- Publishable key (`sb_publishable_...`).

Nunca coloque `secret key` ou `service_role` no site.

## 5. Próxima etapa

Após configurar o banco, o frontend precisa receber:

- Project URL;
- Publishable key.

Esses dois valores são públicos e serão usados para inicializar o cliente
Supabase no navegador. As políticas RLS de `schema.sql` protegem os registros.

Preencha os valores no arquivo `assets/js/supabase-config.js`:

```js
window.SUPABASE_CONFIG = {
  url: "https://SEU-PROJETO.supabase.co",
  publishableKey: "sb_publishable_SUA_CHAVE"
};
```

## 6. Importar as decisões já concluídas

Depois de criar o primeiro administrador, abra o SQL Editor e execute todo o
arquivo `seed_initial_decisions.sql`.

O script sincroniza as decisões preenchidas da planilha como avaliações
concluídas e inclui na Central de Validações os cursos marcados para contato
com a escola. Ele pode ser executado novamente com segurança: registros
importados são atualizados pelo identificador de origem, análises concluídas
diretamente no sistema não são substituídas e contatos existentes não são
duplicados.

## 7. Habilitar sincronização do aplicativo

Se `schema.sql` foi executado antes da implementação da sincronização, execute
uma vez o arquivo `enable_app_sync.sql`. Ele permite que cada avaliador remova
somente os próprios rascunhos. Avaliações concluídas continuam protegidas.

## 8. Sincronizar os cursos permitidos para análise

Execute `sync_course_analysis_scope.sql` no SQL Editor. O script cria e
atualiza o escopo de análise com base na coluna `Unidade criadora` da planilha
T.I. Dados. Somente cursos com o valor exato `GED` ficam marcados como
analisáveis, exceto quando a linha inteira estiver pintada de vermelho vivo na
aba `Export`. Cursos vinculados a CFP ou CT e cursos marcados em vermelho
permanecem armazenados para histórico, mas ficam fora das novas análises.

O script usa o código do curso como chave, não apaga registros e pode ser
executado novamente quando a planilha for atualizada.

## 9. Compartilhar rascunhos pendentes com a equipe

Em bancos existentes, execute uma vez `enable_shared_pending_claims.sql`.
O script permite que qualquer usuário autenticado assuma atomicamente um
rascunho salvo, exceto quando o curso estiver aguardando validação com a unidade.

## 10. Habilitar propostas de novos cursos

Para adicionar a página **Propostas de cursos**, execute uma vez
`enable_course_proposals.sql`. A migração cria o fluxo de sugestões, histórico
de alterações e a estrutura de metadados para futuros documentos, como o plano
de curso. Ela não cria nem publica arquivos no Storage e não altera o catálogo
oficial de cursos.

A migração é **idempotente** e pode ser reexecutada com segurança. Se o banco
já possuía uma versão anterior dela (por exemplo, sem a coluna `mapped_areas`),
reexecute a versão atual para aplicar as colunas e regras novas. A versão atual
já inclui a carga horária opcional, o cancelamento com motivo e o fluxo
simplificado (proposta registrada diretamente, sem análise gerencial), então não
é necessário rodar os arquivos das seções 10.1, 10.2 e 10.4 em bancos que
executarem esta versão completa.

A migração está dividida em duas transações: a primeira cria/adiciona o status
`cancelada` do enum e é commitada antes do corpo principal, para evitar o erro
do PostgreSQL "unsafe use of new value" ao usar o novo valor na mesma
transação.

Se após executar a migração o sistema continuar reportando colunas inexistentes
(erro de "schema cache"), atualize o cache do PostgREST no SQL Editor:

```sql
notify pgrst, 'reload schema';
```

### 10.1 Carga horária opcional

Desde a versão atual, a carga horária **não é obrigatória** no envio de uma
proposta. Em bancos que já rodaram uma versão anterior, execute uma vez
`relax_proposal_workload_requirement.sql` para atualizar o gatilho de
transição; caso contrário, o banco ainda recusará o envio sem carga horária.

### 10.2 Cancelamento de propostas com motivo

O autor e os gestores podem cancelar uma proposta informando o motivo. Em
bancos que já rodaram uma versão anterior de `enable_course_proposals.sql`,
execute uma vez `enable_proposal_cancellation.sql`. Ela adiciona o status
`cancelada`, a coluna `cancellation_reason`, permite a transição de
cancelamento pelo autor, registra o motivo no histórico e cria a política RLS
"Users cancel own proposals". É idempotente.

### 10.3 Verificar o fluxo de propostas

Execute `verify_course_proposals.sql` no SQL Editor. O script confere a
estrutura da tabela, as funções de gatilho, as políticas RLS e testa registrar
uma proposta diretamente, editá-la e excluí-la com motivo — tudo dentro de uma
transação que é desfeita no final, sem gravar dados. Ele depende de existir ao
menos um perfil em `public.profiles` e de as migrações acima já estarem
aplicadas.

### 10.4 Fluxo simplificado (sem análise gerencial)

A partir da versão atual, o fluxo de propostas não possui mais análise
gerencial: ao finalizar, a proposta é registrada diretamente no sistema com o
status `submetida` (exibido como "Registrada"). Autor e gestores podem editar
propostas ativas e excluí-las com motivo (`status = cancelada` +
`cancellation_reason`). O gatilho `protect_course_proposal_transition` passou a
permitir a troca de status por não gestores somente para `cancelada`, e a
política "Users edit own active proposals" substituiu as antigas políticas de
edição e cancelamento.

Em bancos que já possuem as versões anteriores aplicadas, execute uma vez
`simplify_proposal_flow.sql` para atualizar o gatilho e as políticas. É
idempotente e dispensável em bancos que executaram a versão atual completa de
`enable_course_proposals.sql`.

### 10.5 Leitura das propostas para todos

Desde a versão atual, **qualquer usuário autenticado** pode visualizar todas as
propostas de cursos, seus documentos e seu histórico — a política de `SELECT`
de `enable_course_proposals.sql` passou de "somente o autor e gestores" para
"todos os autenticados". Escrita, edição, cancelamento e exclusão continuam
restritos ao autor e aos perfis `gestor`/`admin`.

Em bancos que já possuem uma versão anterior aplicada, execute uma vez
`open_proposals_read_access.sql`. É idempotente.
