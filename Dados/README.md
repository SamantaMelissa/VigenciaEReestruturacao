# Arquivos de referência

Esta pasta guarda os materiais usados para interpretar e atualizar o fluxo:

- planilha `T.I. Dados dos cursos 2026.xlsx`;
- planilha de definição da situação dos cursos;
- PDFs com os dois critérios oficiais;
- apresentação estratégica da área de TI.

Esses arquivos não são necessários para executar o site em produção e, por isso,
não devem ser publicados no Render.

Quando a planilha `T.I. Dados dos cursos 2026.xlsx` for atualizada, execute na
raiz do projeto:

```powershell
python scripts/build_course_data.py
```

O comando regenera `assets/data/courses-data.js`, consumido pelo site, e os
scripts de sincronização da pasta `supabase/`.
