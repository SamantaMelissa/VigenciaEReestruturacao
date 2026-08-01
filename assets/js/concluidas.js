const $=id=>document.getElementById(id);
const normalize=text=>String(text||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const escapeHtml=text=>String(text??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
const formatResult=text=>{const value=String(text||"").trim().toLocaleLowerCase("pt-BR");return value?value.charAt(0).toLocaleUpperCase("pt-BR")+value.slice(1):"Não informado"};
const formatUnit=code=>{const digits=String(code??"").replace(/\D/g,"");return digits.length===3?`${digits[0]}.${digits.slice(1)}`:String(code??"")};
let completed=[];

function mapEvaluation(row){
  const state=row.state||{};
  return {id:row.id,code:row.course_code,name:row.course_name,criterion:row.criterion_label,result:row.final_result||"",justification:row.justification||"",date:new Date(row.updated_at).toLocaleString("pt-BR"),source:state.source||"Avaliação realizada no sistema",sourceId:state.sourceId,decisionPath:state.decisionPath||state.answers||[],scenarioSelections:state.scenarioSelections||{},enrollments:state.enrollments||{},units:state.units||[],createdBy:row.created_by};
}
function resultClass(result){const value=normalize(result);return value.includes("reestruturar")?"reestruturar":value.includes("fechar")?"fechar":"manter"}
function render(){
  const query=normalize($("history-search").value);
  const items=completed.filter(item=>normalize(`${item.name} ${item.code} ${item.result}`).includes(query));
  $("completed-total").textContent=completed.length.toLocaleString("pt-BR");
  $("history-list").innerHTML=items.length?items.map(item=>`<article class="history-row" data-history-id="${item.id}">
    <span class="history-icon">◇</span><div class="history-main"><span class="history-source">${item.sourceId?"Planilha de definição":"Sistema"}</span><strong>${escapeHtml(item.name)}</strong><small>Código ${escapeHtml(item.code)} · ${escapeHtml(item.criterion)}</small></div>
    <div class="history-date"><span>Registrado em</span><strong>${escapeHtml(item.date)}</strong></div><span class="status ${resultClass(item.result)}">${escapeHtml(formatResult(item.result))}</span><span class="history-open">Ver processo →</span>
  </article>`).join(""):`<div class="history-empty">Nenhuma análise concluída encontrada.</div>`;
  document.querySelectorAll("[data-history-id]").forEach(card=>card.onclick=()=>openHistory(card.dataset.historyId));
}
function openHistory(id){
  const item=completed.find(entry=>String(entry.id)===String(id));if(!item)return;
  const course=(window.COURSES_DATA||[]).find(entry=>String(entry.code)===String(item.code));
  $("history-modal-title").textContent=item.name;$("history-modal-code").textContent=`Código ${item.code} · ${item.source}`;
  $("history-result-strip").className=`history-result-strip ${resultClass(item.result)}`;
  $("history-result-strip").innerHTML=`<span>Decisão registrada</span><strong>${escapeHtml(formatResult(item.result))}</strong>`;
  const enrollments=Object.keys(item.enrollments).length?item.enrollments:(course?.enrollments||{}),units=item.units.length?item.units:(course?.unitCodes||[]);
  $("history-overview").innerHTML=`<div><span>Critério aplicado</span><strong>${escapeHtml(item.criterion)}</strong></div><div><span>Origem</span><strong>${escapeHtml(item.source)}</strong></div><div><span>Matrículas disponíveis</span><strong>${Object.keys(enrollments).length?Object.entries(enrollments).map(([year,value])=>`${year}: ${Number(value).toLocaleString("pt-BR")}`).join(" · "):"Não registradas"}</strong></div><div><span>Unidades ofertantes</span><strong>${units.length?units.map(formatUnit).map(escapeHtml).join(", "):"Não registradas"}</strong></div>`;
  $("history-process-list").innerHTML=item.decisionPath.length?item.decisionPath.map((step,index)=>`<div class="process-step"><span>${step.step||index+1}</span><div><strong>${escapeHtml(step.text||"Etapa registrada")}</strong><p>${typeof step.answer==="boolean"?(step.answer?"Resposta: Sim":"Resposta: Não"):""}</p>${step.scenarios?.length?`<p class="process-scenarios"><b>Cenários:</b> ${step.scenarios.map(escapeHtml).join(", ")}</p>`:""}${step.observation?`<p class="process-observation"><b>Observação:</b> ${escapeHtml(step.observation)}</p>`:""}</div></div>`).join(""):`<div class="process-empty">O registro não contém o detalhamento das perguntas percorridas.</div>`;
  $("history-justification").innerHTML=`<details class="justification-disclosure" open><summary><span>Justificativa consolidada</span><small>Visualizar parecer</small></summary><div><p>${escapeHtml(item.justification||"Justificativa não registrada.").replace(/\n/g,"<br>")}</p></div></details>`;
  const canEdit=item.createdBy===appSession.user.id||["gestor","admin"].includes(window.appProfile?.role);
  $("history-modal-edit").hidden=!canEdit;$("history-modal-edit").href=`index.html?historico=${encodeURIComponent(item.id)}`;
  $("history-modal").classList.add("open");$("history-modal").setAttribute("aria-hidden","false");
}
function closeHistory(){$("history-modal").classList.remove("open");$("history-modal").setAttribute("aria-hidden","true")}
function exportCsv(){
  if(!completed.length)return;
  const rows=[["Data","Código","Curso","Critério","Resultado","Justificativa"],...completed.map(item=>[item.date,item.code,item.name,item.criterion,formatResult(item.result),item.justification])];
  const csv="\ufeff"+rows.map(row=>row.map(value=>`"${String(value).replace(/"/g,'""')}"`).join(";")).join("\n");
  const link=document.createElement("a");link.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));link.download=`decisoes-cursos-${new Date().toISOString().slice(0,10)}.csv`;link.click();URL.revokeObjectURL(link.href);
}
async function initialize(){
  try{
    await requireSupabaseSession();if(isPreviewMode){render();return}
    const [evaluations,answers]=await Promise.all([remoteDb.evaluations(["concluida"]),remoteDb.evaluationAnswers()]);
    const evidenceByEvaluation=new Map();
    answers.forEach(row=>{
      if(!evidenceByEvaluation.has(row.evaluation_id))evidenceByEvaluation.set(row.evaluation_id,new Map());
      evidenceByEvaluation.get(row.evaluation_id).set(Number(row.question_step),row.evidence||{});
    });
    completed=evaluations.map(row=>{
      const mapped=mapEvaluation(row),evidence=evidenceByEvaluation.get(row.id);
      if(evidence)mapped.decisionPath=mapped.decisionPath.map(step=>{
        const saved=evidence.get(Number(step.step))||{};
        return {...step,scenarios:step.scenarios?.length?step.scenarios:(saved.scenarios||[]),observation:step.observation||saved.observation||""};
      });
      return mapped;
    });
    render();
  }catch(error){handleSupabaseError(error);showSystemUnavailable()}
}
$("history-search").oninput=render;$("export-csv").onclick=exportCsv;$("history-modal-close").onclick=closeHistory;$("history-modal-ok").onclick=closeHistory;$("history-modal").onclick=event=>{if(event.target===$("history-modal"))closeHistory()};
initialize();
