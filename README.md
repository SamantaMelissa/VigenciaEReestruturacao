# Radar de Cursos

Aplicação estática para apoiar a análise de vigência e reestruturação dos
cursos. A autenticação e os registros compartilhados são fornecidos pelo
Supabase.

## Estrutura

```text
.
├── index.html                 # Jornada principal de análise
├── contatos.html              # Central de validações com as unidades
├── gestao.html                # Painel exclusivo para gestores
├── assets/
│   ├── css/                   # Identidade visual e componentes
│   ├── data/                  # Catálogo gerado da planilha-base
│   └── js/                    # Lógica das páginas e integração Supabase
├── scripts/                   # Ferramentas locais de geração de dados
├── supabase/                  # Estrutura, políticas e cargas do banco
└── Dados/                     # Fontes locais ignoradas pelo Git
```

## Atualizar as planilhas

Coloque as novas cópias em `Dados/` e execute:

```powershell
python scripts/build_course_data.py
```

Depois de atualizar a planilha de definição, execute no SQL Editor do Supabase
o conteúdo de `supabase/seed_initial_decisions.sql`.

## Publicação

O Render deve continuar configurado como **Static Site**, com a raiz do
repositório como diretório de publicação. Não há etapa de build obrigatória.

As planilhas, PDFs, apresentação e arquivos de conferência não são publicados.

## Modo de demonstração

Em `assets/js/supabase-config.js`, use:

```js
previewMode: true
```

Esse modo remove o login e permite validar a busca e o fluxo de decisão, mas
não grava análises, rascunhos ou contatos. Antes da publicação definitiva,
altere obrigatoriamente para:

```js
previewMode: false
```
