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

O script carrega as 52 decisões da planilha como avaliações concluídas. Ele
pode ser executado novamente com segurança, porque o identificador de origem
impede duplicações.

## 7. Habilitar sincronização do aplicativo

Se `schema.sql` foi executado antes da implementação da sincronização, execute
uma vez o arquivo `enable_app_sync.sql`. Ele permite que cada avaliador remova
somente os próprios rascunhos. Avaliações concluídas continuam protegidas.
