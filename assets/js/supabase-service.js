const supabaseConfig = window.SUPABASE_CONFIG || {};
window.isPreviewMode = supabaseConfig.previewMode === true;
const normalizedSupabaseUrl = String(supabaseConfig.url || "")
  .trim()
  .replace(/\/+$/, "");
const normalizedSupabaseKey = String(
  supabaseConfig.publishableKey || "",
).trim();
const validSupabaseConfig =
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(normalizedSupabaseUrl) &&
  /^sb_publishable_/.test(normalizedSupabaseKey);

window.supabaseClient =
  validSupabaseConfig && window.supabase
    ? window.supabase.createClient(normalizedSupabaseUrl, normalizedSupabaseKey)
    : null;

window.appSession = null;
window.appProfile = null;
const legacyCacheKeys=[
  "senai-course-decisions",
  "senai-evaluation-drafts",
  "senai-school-validations",
];
const clearLegacyCache=()=>legacyCacheKeys.forEach((key)=>localStorage.removeItem(key));

function createAuthScreen() {
  if (document.getElementById("auth-screen")) return;
  document.body.insertAdjacentHTML(
    "beforeend",
    `
    <div class="auth-screen" id="auth-screen">
      <div class="auth-card">
        <div class="auth-brand"><span>S</span><div><strong>RADAR DE CURSOS</strong><small>Fábrica de Cursos · SENAI</small></div></div>
        <span class="section-kicker">ACESSO RESTRITO</span>
        <h1 id="auth-title">Entre para continuar</h1>
        <p id="auth-description">Use seu e-mail e senha para acessar o sistema.</p>
        <form id="auth-form">
          <label>E-mail<input id="auth-email" type="email" autocomplete="username" required></label>
          <label>Senha<input id="auth-password" type="password" autocomplete="current-password" required></label>
          <div class="auth-error" id="auth-error"></div>
          <button type="submit" id="auth-submit">Entrar no sistema</button>
        </form>
        <form id="signup-form" class="signup-form" hidden>
          <label>Nome completo<input id="signup-name" type="text" autocomplete="name" required></label>
          <label>E-mail<input id="signup-email" type="email" autocomplete="email" required></label>
          <label>Senha<input id="signup-password" type="password" autocomplete="new-password" minlength="6" required></label>
          <label>Confirmar senha<input id="signup-confirm-password" type="password" autocomplete="new-password" minlength="6" required></label>
          <div class="auth-error" id="signup-error"></div>
          <button type="submit" id="signup-submit">Criar cadastro</button>
        </form>
        <button type="button" class="auth-switch" id="auth-switch">Ainda não tenho cadastro</button>
      </div>
    </div>`,
  );
  const loginForm=document.getElementById("auth-form");
  const signupForm=document.getElementById("signup-form");
  const switchButton=document.getElementById("auth-switch");
  switchButton.onclick=()=>{
    const creating=signupForm.hidden;
    loginForm.hidden=creating;
    signupForm.hidden=!creating;
    document.getElementById("auth-title").textContent=creating?"Crie seu cadastro":"Entre para continuar";
    document.getElementById("auth-description").textContent=creating
      ?"O novo acesso será criado com o perfil de avaliador."
      :"Use seu e-mail e senha para acessar o sistema.";
    switchButton.textContent=creating?"Já tenho cadastro":"Ainda não tenho cadastro";
    document.getElementById("auth-error").textContent="";
    document.getElementById("signup-error").textContent="";
  };
}

function showAuthScreen(message = "") {
  createAuthScreen();
  document.getElementById("auth-error").textContent = message;
  document.getElementById("auth-screen").classList.add("visible");
}

function hideAuthScreen() {
  document.getElementById("auth-screen")?.classList.remove("visible");
}

function installPreviewMode() {
  if (document.getElementById("preview-notice")) return;
  document.body.classList.add("preview-mode");
  document.querySelectorAll(".live-only").forEach((element)=>element.hidden=true);
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div class="preview-notice" id="preview-notice">
      <strong>Modo de demonstração</strong>
      <span>Login e gravações na nuvem estão temporariamente desativados.</span>
    </div>`,
  );
}

window.showSystemUnavailable = function () {
  if (document.getElementById("system-unavailable")) return;
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="system-unavailable" id="system-unavailable" role="alertdialog" aria-modal="true" aria-labelledby="system-unavailable-title">
      <div class="system-unavailable-card">
        <span class="system-unavailable-icon">!</span>
        <div>
          <span class="section-kicker">SISTEMA INDISPONÍVEL</span>
          <h2 id="system-unavailable-title">Não foi possível conectar à base compartilhada</h2>
          <p>A análise foi interrompida para evitar perda ou divergência de dados. Verifique sua internet e tente novamente.</p>
          <button type="button" id="system-retry">Tentar novamente</button>
        </div>
      </div>
    </div>`,
  );
  document.getElementById("system-retry").onclick = () => location.reload();
};

window.isSupabaseConnectionError = function (error) {
  return navigator.onLine === false ||
    /fetch|network|connection|timeout|failed to fetch/i.test(error?.message || "");
};

window.handleSupabaseError = function (error) {
  console.error(error);
  if (!isSupabaseConnectionError(error)) return false;
  showSystemUnavailable();
  return true;
};

async function loadProfile(userId) {
  const { data, error } = await window.supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) throw error;
  window.appProfile = data;
  return data;
}

function installUserControl() {
  const actions = document.querySelector(".top-actions");
  if (!actions || document.getElementById("user-control")) return;
  const fullName =
    window.appProfile?.display_name ||
    window.appSession?.user?.email?.split("@")[0] ||
    "Usuário";
  const firstName =
    String(fullName).trim().split(/\s+/)[0].split(/[._-]/)[0] || "Usuário";
  const name =
    firstName.charAt(0).toLocaleUpperCase("pt-BR") +
    firstName.slice(1).toLocaleLowerCase("pt-BR");
  const safeName = name.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char],
  );
  actions.insertAdjacentHTML(
    "beforeend",
    `
    <div class="user-control" id="user-control">
      <button type="button" id="user-control-button">${safeName}</button>
      <button type="button" id="logout-button">Sair</button>
    </div>`,
  );
  const canManage = ["gestor", "admin"].includes(window.appProfile?.role);
  document
    .querySelectorAll(".manager-only")
    .forEach((element) => element.classList.toggle("visible", canManage));
  document.getElementById("logout-button").onclick = async () => {
    await window.supabaseClient.auth.signOut();
    clearLegacyCache();
    location.href = "index.html";
  };
}

window.requireSupabaseSession = async function () {
  if (window.isPreviewMode) {
    window.appSession={user:{id:"preview",email:"demonstracao@local"}};
    window.appProfile={display_name:"Demonstração",role:"avaliador"};
    installPreviewMode();
    return window.appSession;
  }
  if (!window.supabaseClient) {
    showSystemUnavailable();
    throw new Error("Supabase não configurado.");
  }
  createAuthScreen();
  const form = document.getElementById("auth-form");
  const signupForm=document.getElementById("signup-form");
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = document.getElementById("auth-submit");
    button.disabled = true;
    button.textContent = "Entrando...";
    const { error } = await window.supabaseClient.auth.signInWithPassword({
      email: document.getElementById("auth-email").value.trim(),
      password: document.getElementById("auth-password").value,
    });
    button.disabled = false;
    button.textContent = "Entrar no sistema";
    if (error) {
      const connectionFailure = isSupabaseConnectionError(error);
      if (connectionFailure) showSystemUnavailable();
      else showAuthScreen("E-mail ou senha inválidos.");
    }
  };
  signupForm.onsubmit=async(event)=>{
    event.preventDefault();
    const name=document.getElementById("signup-name").value.trim();
    const email=document.getElementById("signup-email").value.trim();
    const password=document.getElementById("signup-password").value;
    const confirmation=document.getElementById("signup-confirm-password").value;
    const errorBox=document.getElementById("signup-error");
    errorBox.classList.remove("success");
    if(password!==confirmation){
      errorBox.textContent="As senhas informadas são diferentes.";
      return;
    }
    const button=document.getElementById("signup-submit");
    button.disabled=true;
    button.textContent="Criando cadastro...";
    const {data,error}=await window.supabaseClient.auth.signUp({
      email,
      password,
      options:{data:{display_name:name}},
    });
    button.disabled=false;
    button.textContent="Criar cadastro";
    if(error){
      if(isSupabaseConnectionError(error)){
        showSystemUnavailable();
        return;
      }
      errorBox.textContent=error.message?.toLowerCase().includes("already")
        ?"Este e-mail já possui cadastro."
        :"Não foi possível criar o cadastro. Confira os dados.";
      return;
    }
    errorBox.classList.add("success");
    errorBox.textContent=data.session
      ?"Cadastro criado. Acessando o sistema..."
      :"Cadastro criado. Confirme o e-mail recebido antes de entrar.";
  };
  const {data:{session},error:sessionError}=await window.supabaseClient.auth.getSession();
  if(sessionError)throw sessionError;
  if (session) {
    window.appSession = session;
    await loadProfile(session.user.id);
    clearLegacyCache();
    hideAuthScreen();
    installUserControl();
    return session;
  }
  showAuthScreen();
  return new Promise((resolve, reject) => {
    const {
      data: { subscription },
    } = window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
      if (event !== "SIGNED_IN" || !session) return;
      try {
        window.appSession = session;
        await loadProfile(session.user.id);
        clearLegacyCache();
        hideAuthScreen();
        installUserControl();
        subscription.unsubscribe();
        resolve(session);
      } catch (error) {
        reject(error);
      }
    });
  });
};

window.remoteDb = {
  async evaluations(statuses) {
    let query = window.supabaseClient
      .from("evaluations")
      .select("*")
      .order("updated_at", { ascending: false });
    if (statuses?.length) query = query.in("status", statuses);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },
  async validations() {
    const { data, error } = await window.supabaseClient
      .from("school_validations")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async analysisScope() {
    const { data, error } = await window.supabaseClient
      .from("course_analysis_scope")
      .select("course_code,course_name,creator_unit,is_analyzable");
    if (error) throw error;
    return data || [];
  },
};
