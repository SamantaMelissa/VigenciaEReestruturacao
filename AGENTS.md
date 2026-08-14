# Início rápido para trabalhos com IA

## Objetivo do projeto

**Radar de Cursos — SENAI** é uma aplicação web estática para registrar e
acompanhar decisões sobre vigência, reestruturação e oferta de cursos. Ela
combina dados de planilhas institucionais com um fluxo de avaliação e usa o
Supabase para autenticação, persistência, concorrência e auditoria.

## Stack e execução local

- Frontend: HTML, CSS e JavaScript puro, sem etapa de build nem framework.
- Dados de cursos: arquivo JavaScript gerado por Python a partir de planilhas.
- Backend: Supabase (Auth, PostgreSQL, RLS, funções RPC e gatilhos).
- Hospedagem: Render como **Static Site**, publicado a partir da raiz.

Para executar localmente, na raiz do repositório:

```powershell
python -m http.server 8000
```

Abra `http://localhost:8000`. Não valide o site por `file:///`, pois o
comportamento do navegador pode divergir.

## Mapa de arquivos

| Caminho | Responsabilidade |
|---|---|
| `index.html` | Busca de cursos, fluxo de análise e pendências. |
| `concluidas.html` | Histórico, detalhes e exportação de análises concluídas. |
| `validacoes.html` | Contato e retorno das unidades escolares. |
| `gestao.html` | Indicadores e operações gerenciais. |
| `propostas.html` | Sugestões de novos cursos: cards compactos, modal de detalhes, análise gerencial e cancelamento com motivo. |
| `assets/css/styles.css` | Tema, componentes e responsividade compartilhados. |
| `assets/js/app.js` | Regras e interface do fluxo principal de avaliação. |
| `assets/js/contacts.js` | Fluxo da Central de Validações. |
| `assets/js/concluidas.js` | Histórico e exportação. |
| `assets/js/gestao.js` | Indicadores e gestão. |
| `assets/js/propostas.js` | Fluxo de propostas: registro direto em etapas, cards, detalhes, edição e exclusão com motivo. |
| `assets/js/supabase-service.js` | Sessão, perfil, carregamento, operações compartilhadas e validação do e-mail `@sp.senai.br`. |
| `assets/js/supabase-config.js` | Configuração pública do cliente e modo de demonstração. |
| `assets/data/courses-data.js` | Catálogo gerado; não editar manualmente. |
| `scripts/build_course_data.py` | Gera o catálogo e SQLs derivados das planilhas. |
| `supabase/` | Schema inicial, migrações e funções específicas do banco. |
| `docs/multifactory-plan.md` | Plano de evolução para multi-fábrica (referência, ainda em planejamento). |
| `Dados/` | Fontes locais de trabalho; em geral ignoradas pelo Git e não publicadas. |

## Regras de negócio que não devem ser quebradas

- Apenas cursos cuja **Unidade criadora** é `GED` e cuja linha não está
  integralmente em vermelho vivo podem iniciar nova análise.
- Os critérios são `fic` e `regular`. Há exceções explícitas para os cursos
  `109575` e `87967`, que usam `fic`.
- Uma avaliação ativa (`rascunho` ou `em_analise`) por curso é garantida no
  banco; não substitua essa proteção por lógica apenas visual.
- O retorno positivo da unidade devolve o curso para a fila compartilhada; o
  primeiro avaliador a assumi-lo torna-se responsável pela continuidade.
- Avaliações concluídas, rascunhos, respostas e contatos são dados
  compartilhados. Preserve RLS, funções RPC, gatilhos e o histórico ao alterar
  esses fluxos.
- Propostas de cursos são sugestões separadas do catálogo oficial. Uma proposta
  registrada segue para inclusão na planilha-fonte antes de aparecer em
  `courses-data.js`.
- O acesso exige e-mail institucional `@sp.senai.br`. A validação acontece no
  atributo `pattern` dos inputs (escapado corretamente dentro do template
  literal) e na função `isAllowedEmail` em `supabase-service.js`. Não altere
  esse domínio sem alinhar os dois pontos.
- A carga horária é **opcional** nas propostas; não reimponha a obrigatoriedade
  no frontend nem no gatilho `protect_course_proposal_transition`.
- O fluxo de propostas não tem análise gerencial: ao finalizar, a proposta é
  registrada diretamente como `submetida` (exibida como "Registrada"). Todos os
  usuários autenticados podem visualizar e editar qualquer proposta. A exclusão
  (status `cancelada`) fica restrita a gestor/admin e ao autor da proposta;
  `cancellation_reason` registra o motivo. O gatilho
  `protect_course_proposal_transition` restringe a mudança de status por não
  gestores (exceto cancelamento com motivo), e as políticas RLS "All
  authenticated users view proposals", "All authenticated users edit proposals"
  e "Creators and managers delete proposals" regem leitura, edição e exclusão.

## Alterando dados de cursos

As planilhas atualizadas ficam em `Dados/`. Para regerar os artefatos:

```powershell
python scripts/build_course_data.py
```

O comando atualiza `assets/data/courses-data.js` e pode atualizar SQLs em
`supabase/`, incluindo o escopo de análise e decisões iniciais. Revise o diff
dos arquivos SQL antes de executá-los no Supabase. Nunca altere o catálogo
gerado diretamente se a mudança vier da fonte tabular.

## Alterando o banco

1. Leia `supabase/README.md` e identifique se o banco já possui a alteração.
2. Para instalação nova, aplique primeiro `supabase/schema.sql` e, quando
   aplicável, `supabase/seed_initial_decisions.sql`.
3. Para bancos existentes, execute **somente** a migração SQL relacionada à
   funcionalidade; os arquivos não devem ser executados indiscriminadamente.
4. Mantenha as alterações idempotentes quando possível e preserve políticas
   RLS, permissões e funções RPC utilizadas por `supabase-service.js`.
5. Atualize a documentação da pasta `supabase/` quando a ordem ou pré-requisito
   de uma migração mudar.

## Segurança

- `supabase-config.js` pode conter apenas a URL do projeto e a
  **Publishable key**. Nunca adicione `service_role`, secret key, senhas ou
  tokens privados ao frontend, commits ou documentação.
- Não enfraqueça as políticas RLS para contornar uma falha de interface.
- `Dados/`, `outputs/`, `.env*` e perfis de navegador são arquivos locais e
  não devem ser publicados.
- O modo `previewMode: true` é apenas para demonstração: ele desativa login e
  gravações. Restaure `false` antes de uso real.

## Convenções de implementação

- Preserve a arquitetura sem framework e o carregamento por tags `<script>`;
  respeite a ordem atual: dados, configuração, SDK do Supabase, serviço e JS
  específico da página.
- Centralize comportamento compartilhado em `supabase-service.js` e estilos
  compartilhados em `assets/css/styles.css`.
- Ao mudar uma interface, revise desktop e mobile e mantenha a identidade
  visual existente (vermelho, preto e branco).
- Quando um arquivo estático publicado for alterado, atualize o parâmetro de
  versão (`?v=...`) da referência correspondente no HTML para evitar cache
  antigo no navegador.
- Mantenha arquivos de texto em UTF-8. O conteúdo do projeto é em português
  brasileiro.

## Verificação antes de concluir uma tarefa

1. Inspecione `git diff` para garantir que não houve alteração acidental de
   arquivos gerados, planilhas ou configuração.
2. Para mudanças no frontend, inicie o servidor local e teste o fluxo afetado
   no navegador; inclua estados vazios, erro de conexão e permissões quando
   relevantes.
3. Para mudanças de dados, execute o gerador e confirme que o catálogo e SQLs
   resultantes correspondem à planilha.
4. Para mudanças no Supabase, valide a migração em ambiente seguro e confirme
   os fluxos afetados com usuário avaliador, gestor e/ou administrador.
5. Não há suíte automatizada configurada no repositório atualmente; documente
   no handoff os testes manuais executados e qualquer etapa pendente no
   Supabase ou Render.

## Leituras obrigatórias conforme a tarefa

- Visão geral, operação e publicação: `README.md`.
- Dados e regeneração: `Dados/README.md` e `scripts/build_course_data.py`.
- Banco, perfis e migrações: `supabase/README.md`, seguido do SQL específico.
- Evolução multi-fábrica: `docs/multifactory-plan.md`.
