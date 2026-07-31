# Radar de Cursos — SENAI

Sistema web para organizar e registrar decisões sobre vigência, reestruturação e oferta de cursos. O projeto transforma planilhas institucionais e evidências da Base T.I. em um fluxo guiado, compartilhado e auditável.

> Interface estática no Render, autenticação e persistência no Supabase.

## O que o sistema oferece

- Fluxos orientados pelos critérios **FIC** e **Aprendizagem/Qualificação**.
- Consulta às matrículas por ano e às unidades ofertantes da Base T.I.
- Seleção múltipla de cenários estratégicos.
- Registro de observações técnicas e tecnologias a incluir ou retirar.
- Link direto para consulta do plano de curso e pesquisa de ofertas do SENAI-SP.
- Salvamento de rascunhos e retomada da análise no ponto em que parou.
- Bloqueio de avaliações ativas para evitar trabalho simultâneo e duplicidades.
- Edição de avaliações concluídas com recuperação das respostas anteriores.
- Histórico completo e justificativa consolidada em linguagem gerencial.
- Central de Validações para contatos com unidades.
- Fila pública de retornos positivos: qualquer avaliador pode assumir e continuar.
- Lista de análises pendentes e painel gestor com indicadores consolidados.
- Autenticação, cadastro de usuários e perfis de acesso pelo Supabase.
- Layout responsivo, identidade visual em vermelho, preto e branco e favicon próprio.

## Fluxo resumido

```text
Planilha de definições + Base T.I.
                ↓
       Curso pendente de análise
                ↓
       Fluxo FIC ou Regular
                ↓
  ┌──────── decisão direta ────────┐
  │                                │
  └── contato com a unidade ───────┘
                    ↓
          Não → fecha a vigência
          Sim → retorna à fila da equipe
                    ↓
       Um avaliador assume e continua
```

Na Central de Validações, a pessoa responsável pelo contato apenas registra o retorno. Ela não precisa continuar a avaliação. Quando a unidade responde **Sim**, o curso aparece em **Análises pendentes** para todos, com a ação **Assumir e continuar**. O primeiro usuário que assumir fica responsável pela continuidade.

## Páginas

| Arquivo | Finalidade |
|---|---|
| `index.html` | Busca de cursos, execução do fluxo, histórico e avaliações concluídas |
| `pendencias.html` | Fila de trabalho, rascunhos e retornos disponíveis para a equipe |
| `validacoes.html` | Central de contatos e validações com as unidades |
| `gestao.html` | Indicadores, acompanhamento gerencial e trocas de área |

## Estrutura do projeto

```text
.
├── index.html
├── pendencias.html
├── validacoes.html
├── gestao.html
├── assets/
│   ├── css/                  # Tema, componentes e responsividade
│   ├── data/                 # Catálogo gerado para o frontend
│   ├── js/                   # Fluxos, telas e integração Supabase
│   └── favicon.svg
├── scripts/
│   └── build_course_data.py  # Geração dos dados a partir das planilhas
├── supabase/                 # Schema, funções, políticas e migrações SQL
└── Dados/                    # Arquivos de apoio locais não publicados
```

## Configuração do Supabase

O frontend utiliza somente a URL pública e a **Publishable key**. Configure-as em `assets/js/supabase-config.js`:

```js
window.SUPABASE_CONFIG = {
  previewMode: false,
  url: "https://SEU-PROJETO.supabase.co",
  publishableKey: "sb_publishable_...",
};
```

Nunca coloque `service_role`, secret key ou senha do banco no repositório.

### Instalação nova

Em um projeto Supabase vazio, execute no SQL Editor:

1. `supabase/schema.sql`
2. `supabase/seed_initial_decisions.sql`, quando houver decisões importadas da planilha

### Atualização do retorno da Central de Validações

Para habilitar **Assumir e continuar**, execute uma vez:

```text
supabase/enable_validation_handoff.sql
```

Esse script:

- adiciona a indicação de avaliações disponíveis para a equipe;
- cria a reserva atômica pelo primeiro usuário que clicar;
- mantém os retornos negativos como avaliações concluídas;
- recupera retornos positivos registrados antes da funcionalidade.

Se o botão não aparecer, confirme primeiro se esse arquivo foi executado no mesmo projeto Supabase usado pelo site.

Os demais arquivos da pasta `supabase/` são migrações ou rotinas específicas. Consulte `supabase/README.md` antes de executá-los e não rode todas as migrações aleatoriamente.

## Atualização das planilhas

Coloque as fontes atualizadas em `Dados/` e execute:

```powershell
python scripts/build_course_data.py
```

O script atualiza `assets/data/courses-data.js`, utilizado pelo site estático. Quando houver mudanças no escopo de cursos ou decisões iniciais, revise também os arquivos SQL gerados antes de executá-los no Supabase.

Cursos oficialmente retirados da grade devem ser registrados em `config/courses-out-of-grid.txt`. Eles permanecem no catálogo técnico e no histórico, mas o gerador os marca como não analisáveis. Para aplicar a lista atual diretamente no banco, execute `supabase/remove_courses_from_grid.sql`.

## Execução local

Como o projeto é estático, ele pode ser servido por qualquer servidor HTTP local. Exemplo:

```powershell
python -m http.server 8000
```

Depois acesse `http://localhost:8000`. Abrir diretamente pelo caminho `file:///` pode causar diferenças de comportamento entre navegadores.

## Publicação

O Render deve permanecer configurado como **Static Site**, usando a raiz do repositório como diretório de publicação. Não existe etapa de build obrigatória.

O Supabase permanece responsável por:

- login e cadastro;
- avaliações e respostas;
- rascunhos e reservas;
- contatos com unidades;
- escopo de cursos;
- dados compartilhados e auditoria.

Após um push na branch `main`, aguarde a implantação automática do Render e faça uma atualização forçada no navegador (`Ctrl + F5`) se ainda aparecer a versão anterior.

## Modo de demonstração

Para navegar sem autenticação e sem gravar no banco:

```js
previewMode: true
```

Antes do uso real, restaure:

```js
previewMode: false
```

O modo de demonstração não salva análises, contatos ou progresso.

## Segurança e operação

- O banco utiliza Row Level Security e funções controladas no Supabase.
- As chaves presentes no frontend devem ser exclusivamente públicas.
- A reserva de uma avaliação é feita no banco, não apenas visualmente.
- Cliques simultâneos são resolvidos pelo Supabase: somente o primeiro usuário assume.
- Arquivos de trabalho, planilhas auxiliares, PDFs e apresentações devem permanecer em `Dados/` e fora da publicação.

## Tecnologias

- HTML, CSS e JavaScript sem framework
- Supabase Auth, PostgreSQL e PostgREST
- Python para preparação dos dados
- Render para hospedagem estática

---

Desenvolvido para tornar a análise de cursos mais simples, consistente e transparente para avaliadores e gestores.
