# Plano: Radar de Cursos multi-fábrica

Documento de referência para transformar o Radar de Cursos em uma aplicação
multi-tenant, em que cada fábrica de cursos administra seu próprio catálogo,
sua equipe e seus documentos, com um painel administrativo para o gestor.

Status: **planejamento** (ainda sem código implementado).

---

## Contexto atual

- Aplicação estática (HTML/CSS/JS, sem build) hospedada no Render.
- Persistência e autenticação no Supabase (Auth, PostgreSQL, RLS, RPC).
- Fábrica única: somente cursos com **Unidade criadora = GED** são analisáveis.
- Catálogo embutido em `assets/data/courses-data.js`, gerado por
  `scripts/build_course_data.py` a partir de uma planilha em `Dados/`.
- Perfis globais: `avaliador`, `gestor` e `admin`.
- Acesso restrito a e-mails `@sp.senai.br` (validação no frontend e no banco).
- Propostas de cursos implementadas: cards compactos, modal de detalhes, análise
  gerencial, carga horária opcional e cancelamento com motivo (`cancelada` +
  `cancellation_reason`), com histórico auditado.
- Já existem documentos/armazenamento futuros em `course_proposal_documents`.

---

## Objetivo

Permitir que o sistema atenda **várias fábricas de cursos**. Um gestor cria a
fábrica, define quem tem acesso, envia os arquivos de estruturação (xls, ppt,
docx, pdf) e o sistema extrai os cursos a partir desses arquivos — a base de
tudo passa a ser alimentada pela própria fábrica. Cada fábrica enxerga somente
os seus dados.

---

## Fase 0 — Repositório e preparação

Situação atual: o código está em `github.com/SamantaMelissa/...`, mas 62 de 64
commits são de Gustavo (`Gustavo-Castello`/`ProfCastello`).

### Ação recomendada

Mover o repositório para a conta de Gustavo, preservando o histórico:

```powershell
git remote add mine https://github.com/Gustavo-Castello/radar-cursos.git
git push mine main
git push mine ProfCastello
```

- Reconfigurar o Render (Static Site) para apontar para o novo repositório.
- Manter o repositório original como `upstream` de referência.
- Idealmente, negociar a **transferência oficial** do repositório
  (`Settings → Transfer`), que redireciona o link antigo automaticamente.
- Dar crédito à Samanta no README por ter iniciado o projeto.

### Preparação do Supabase

- Documentar a versão do schema atual antes de qualquer migração.
- Criar o bucket de Storage para documentos por fábrica.

---

## Fase 1 — Modelo de dados multi-tenant

Arquivo: `supabase/enable_multifactory.sql` (nova migração, idempotente).

### Novas tabelas

```sql
create table public.factories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  allowed_email_domain text,
  status text not null default 'ativa',       -- ativa | suspensa
  settings jsonb not null default '{}',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.factory_members (
  factory_id uuid not null references public.factories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null default 'avaliador',  -- papel dentro da fábrica
  status text not null default 'ativo',               -- ativo | pendente | inativo
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (factory_id, user_id)
);
```

### Coluna `factory_id` nas tabelas existentes

- `evaluations`
- `school_validations`
- `course_proposals`
- `course_analysis_scope` (PK passa a ser `(factory_id, course_code)`)
- `audit_events`
- `course_proposal_documents`

### Backfill

- Criar automaticamente a fábrica **GED** (slug `ged`) e vincular todos os
  registros existentes a ela. Nenhum dado atual é perdido.

### Funções RLS

```sql
create or replace function public.user_factory_role(p_factory_id uuid)
returns public.app_role
language sql stable security definer set search_path = public
as $$
  select role from public.factory_members
  where factory_id = p_factory_id
    and user_id = auth.uid()
    and status = 'ativo';
$$;
```

- Políticas existentes passam a exigir que o usuário seja **membro ativo** da
  fábrica da linha.
- `profiles.role = 'admin'` global permanece como papel de plataforma (vê tudo).
- `gestor`/`avaliador` passam a valer **dentro da fábrica** (via
  `factory_members`).

### Regra de e-mail configurável

- `ALLOWED_EMAIL_DOMAIN` deixa de ser fixo no frontend
  (supabase-service.js:35).
- O login aceita domínios de fábricas ativas; se a fábrica define
  `allowed_email_domain`, ele é usado; senão, mantém o padrão `sp.senai.br`.

---

## Fase 2 — Contexto de fábrica no frontend

- `supabase-service.js`: funções `getActiveFactory()` e `setActiveFactory()`,
  persistindo a fábrica ativa em `localStorage`.
- Se o usuário pertence a **várias** fábricas, um seletor é exibido na barra
  superior.
- Todas as consultas ganham filtro `.eq("factory_id", activeFactoryId)`.
- Ajustar `app.js`, `gestao.js`, `concluidas.js`, `contacts.js`, `propostas.js`
  para trabalhar com o contexto da fábrica ativa.

---

## Fase 3 — Painel administrativo

Novas páginas: `admin.html` + `assets/js/admin.js` (+ estilos em
`assets/css/styles.css`).

Acesso: somente perfil global `admin` (plataforma) e `gestor` da própria
fábrica, conforme o recurso.

### Recursos

- **Lista de fábricas** com KPIs: nº de cursos, análises, validações, membros.
- **Criar fábrica**: nome, slug, descrição, domínio de e-mail, área/setor.
- **Gerenciar membros**: convidar por e-mail (cria usuário + vínculo em
  `factory_members` com papel e status `pendente`), alterar papel, remover.
- **Upload de documentos**: bucket `factories/{factory_id}/documents/`
  (xls, ppt, docx, pdf).
- **Acompanhar ingesta**: status do processamento dos arquivos enviados.

---

## Fase 4 — Ingestão e análise de arquivos ("a base de tudo")

O gestor envia os arquivos e o sistema **extrai os cursos a partir deles**.
Recomendação: processar no navegador, mantendo a arquitetura estática (sem
back-end adicional).

1. **XLSX (fonte estruturada)**
   - Parse com **ExcelJS/SheetJS** (já usado para exportação em `gestao.html`).
   - Extrair código, nome, carga horária, nível, unidade criadora, matrículas
     por ano e unidades.
   - Gravar em `factory_courses` e regenerar `course_analysis_scope` da fábrica.
   - Portar a lógica de `scripts/build_course_data.py` para JavaScript.

2. **DOCX/PPTX (contexto e referência)**
   - Extrair texto com **mammoth.js** (docx) e **JSZip + XML** (pptx).
   - Alimentar campos de apoio (plano de curso, justificativa, tecnologias).
   - Ficar disponível como evidência nas análises.

3. **Tela de revisão**
   - Antes de ativar, o gestor vê a prévia dos cursos extraídos, corrige
     divergências e confirma.
   - Nada é publicado sem revisão.

4. **Auditoria**: os arquivos permanecem no Storage como evidência.

---

## Fase 5 — Migração do catálogo estático

- O catálogo deixa de ser o arquivo único `courses-data.js` e passa a ser
  consultado por fábrica (`factory_courses`, com cache em `localStorage`).
- `index.html` e `app.js`: a busca em `window.COURSES_DATA` passa a consultar o
  catálogo da fábrica ativa.
- A planilha GED atual continua funcionando via importação inicial.

---

## Fase 6 — Piloto e publicação

- Criar a 2ª fábrica no painel.
- Convidar os professores interessados.
- Subir a planilha da nova fábrica e validar o fluxo completo, isolado:
  busca → análise → validação → gestão → propostas.
- Atualizar o parâmetro `?v=...` das referências alteradas no HTML (evita cache
  antigo).
- Testar desktop e mobile (identidade visual vermelho/preto/branco mantida).

---

## Regras de negócio que não podem ser quebradas

- Uma avaliação ativa por curso por fábrica permanece garantida no banco.
- Retorno positivo da unidade devolve o curso à fila compartilhada **da mesma
  fábrica**.
- RLS, funções RPC, gatilhos e histórico são preservados.
- Propostas aprovadas continuam fora do catálogo oficial até inclusão na
  planilha-fonte.
- Apenas `factory_courses` publicados pela fábrica entram no fluxo de análise.

---

## Decisões em aberto

1. **Catálogo no banco** (recomendado, escalável) **ou** arquivos estáticos por
   fábrica (mais rápido de implementar)?
2. **Upload processado no navegador** (100% estático, recomendado) ou Edge
   Function do Supabase?
3. Confirmar que `admin` global é só plataforma e `gestor` administra os
   membros da própria fábrica.
4. Negociação da transferência do repositório com a professora.

---

## Verificação

- `git diff` sem alteração acidental de arquivos gerados ou planilhas.
- Frontend: testes no servidor local (`python -m http.server 8000`), incluindo
  estados vazios, erro de conexão e permissões.
- Dados: executar o gerador e conferir catálogo e SQLs resultantes.
- Supabase: validar a migração em ambiente seguro com usuários avaliador,
  gestor e admin.
- Documentar no handoff os testes manuais e pendências no Supabase/Render.
