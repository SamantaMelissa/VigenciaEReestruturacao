const $=id=>document.getElementById(id);
const normalize=text=>String(text||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const escapeHtml=text=>String(text??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
const formatDecisionResult=text=>{
  const value=String(text||"").trim().toLocaleLowerCase("pt-BR");
  return value?value.charAt(0).toLocaleUpperCase("pt-BR")+value.slice(1):"";
};
let completedEvaluations=[];

function resultGroup(result){
  const value=normalize(result);
  if(value.includes("reestruturar"))return "Reestruturar";
  if(value.includes("fechar"))return "Fechar vigência";
  if(value.includes("manter"))return "Manter";
  if(value.includes("incluir"))return "Incluir UCs comuns";
  return result||"Outros";
}

function renderBars(target,entries){
  const maximum=Math.max(1,...entries.map(([,count])=>count));
  $(target).innerHTML=entries.length?entries.map(([label,count])=>`
    <div class="manager-bar">
      <div><strong>${escapeHtml(label)}</strong><span>${count}</span></div>
      <i><b style="width:${Math.max(4,count/maximum*100)}%"></b></i>
    </div>`).join(""):`<div class="manager-empty">Ainda não há dados para apresentar.</div>`;
}

function renderTable(){
  const query=normalize($("manager-search").value);
  const items=completedEvaluations.filter(item=>normalize(`${item.course_name} ${item.course_code} ${item.final_result}`).includes(query)).slice(0,12);
  $("manager-table").innerHTML=items.length?`
    <div class="manager-table-head"><span>Curso</span><span>Critério</span><span>Decisão</span><span>Atualização</span></div>
    ${items.map(item=>`
      <div class="manager-table-row">
        <div><strong>${escapeHtml(item.course_name)}</strong><small>Código ${escapeHtml(item.course_code)}</small></div>
        <span>${escapeHtml(item.criterion_label)}</span>
        <b class="manager-decision">${escapeHtml(formatDecisionResult(item.final_result)||"Não informado")}</b>
        <time>${new Date(item.updated_at).toLocaleDateString("pt-BR")}</time>
      </div>`).join("")}`:
    `<div class="manager-empty">Nenhuma análise encontrada.</div>`;
}

async function initializeManager(){
  try{
    await requireSupabaseSession();
    if(isPreviewMode){location.replace("index.html");return}
    if(!["gestor","admin"].includes(appProfile?.role)){
      location.replace("index.html");
      return;
    }
    const [completed,drafts,validations]=await Promise.all([
      remoteDb.evaluations(["concluida"]),
      remoteDb.evaluations(["rascunho","em_analise"]),
      remoteDb.validations()
    ]);
    completedEvaluations=completed;
    const openValidations=validations.filter(item=>item.status!=="concluido");
    $("kpi-completed").textContent=completed.length.toLocaleString("pt-BR");
    $("kpi-drafts").textContent=drafts.length.toLocaleString("pt-BR");
    $("kpi-open").textContent=openValidations.length.toLocaleString("pt-BR");
    $("kpi-validations").textContent=validations.filter(item=>item.status==="concluido").length.toLocaleString("pt-BR");
    $("manager-updated").textContent=new Date().toLocaleString("pt-BR");

    const results=Object.entries(completed.reduce((groups,item)=>{
      const key=resultGroup(item.final_result);groups[key]=(groups[key]||0)+1;return groups;
    },{})).sort((a,b)=>b[1]-a[1]);
    const criteria=Object.entries(completed.reduce((groups,item)=>{
      const key=item.criterion_label||"Não informado";groups[key]=(groups[key]||0)+1;return groups;
    },{})).sort((a,b)=>b[1]-a[1]);
    renderBars("result-bars",results);
    renderBars("criterion-bars",criteria);
    renderTable();
  }catch(error){
    handleSupabaseError(error);
    $("manager-updated").textContent="Não foi possível carregar";
    showSystemUnavailable();
  }
}

$("manager-search").oninput=renderTable;
initializeManager();
