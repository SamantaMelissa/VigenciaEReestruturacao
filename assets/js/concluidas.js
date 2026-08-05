const $=id=>document.getElementById(id);
const normalize=text=>String(text||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const escapeHtml=text=>String(text??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
const formatResult=text=>{const value=String(text||"").trim().toLocaleLowerCase("pt-BR");return value?value.charAt(0).toLocaleUpperCase("pt-BR")+value.slice(1):"Não informado"};
const formatUnit=code=>{const digits=String(code??"").replace(/\D/g,"");return digits.length===3?`${digits[0]}.${digits.slice(1)}`:String(code??"")};
let completed=[];

function mapEvaluation(row){
  const state=row.state||{};
  return {id:row.id,code:row.course_code,name:row.course_name,criterionKey:row.criterion_key,criterion:row.criterion_label,result:row.final_result||"",justification:row.justification||"",date:new Date(row.updated_at).toLocaleString("pt-BR"),source:state.source||"Avaliação realizada no sistema",sourceId:state.sourceId,decisionPath:state.decisionPath||state.answers||[],scenarioSelections:state.scenarioSelections||{},enrollments:state.enrollments||{},units:state.units||[],observations:state.observations||"",questionObservations:state.questionObservations||{},changeType:state.changeType||"",targetArea:state.targetArea||"",previousArea:state.previousArea||"",createdBy:row.created_by};
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
  $("history-modal").classList.add("open");$("history-modal").setAttribute("aria-hidden","false");document.body.classList.add("modal-open");
}
function closeHistory(){$("history-modal").classList.remove("open");$("history-modal").setAttribute("aria-hidden","true");document.body.classList.remove("modal-open")}
function parseBrazilianDate(value){
  const match=String(value||"").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!match)return value||"";
  return new Date(Number(match[3]),Number(match[2])-1,Number(match[1]));
}
function exportObservation(item){
  const notes=[item.observations,...Object.values(item.questionObservations||{}),...(item.decisionPath||[]).map(step=>step.observation)].map(value=>String(value||"").trim()).filter(Boolean);
  return [...new Set(notes)].join("\n");
}
const MAPPED_AREA_NAMES={1:"Desenvolvimento de software",2:"Redes e Infraestrutura",3:"Segurança Cibernética",4:"Cloud e DevOps",5:"Dados"};
function mappedAreas(item){
  const values=[];
  (item.decisionPath||[]).forEach(step=>values.push(...(step?.scenarios||[])));
  Object.values(item.scenarioSelections||{}).forEach(selected=>values.push(...(Array.isArray(selected)?selected:[])));
  const original=String(item.justification||""),normalizedOriginal=normalize(original),numbers=[];
  for(const match of normalizedOriginal.matchAll(/cenarios?\s+mapeados?\s*\(([^)]+)\)/g))numbers.push(...(match[1].match(/[1-5]/g)||[]));
  for(const match of normalizedOriginal.matchAll(/cenario\s*([1-5])/g))numbers.push(match[1]);
  numbers.forEach(number=>values.push(MAPPED_AREA_NAMES[number]));
  const canonical=values.map(value=>{const key=normalize(value);if(key.includes("desenvolvimento"))return MAPPED_AREA_NAMES[1];if(key.includes("redes")||key.includes("infraestrutura"))return MAPPED_AREA_NAMES[2];if(key.includes("seguranca")||key.includes("cyber"))return MAPPED_AREA_NAMES[3];if(key.includes("cloud")||key.includes("devops")||key.includes("nuvem"))return MAPPED_AREA_NAMES[4];if(key.includes("dados"))return MAPPED_AREA_NAMES[5];return String(value||"").trim()}).filter(Boolean);
  const unique=[...new Set(canonical)];
  if(unique.length)return unique.join("; ");
  return normalizedOriginal.includes("nao responde")||normalizedOriginal.includes("nao foi relacionado")?"Nenhuma área mapeada":"Não informada";
}
async function exportExcel(){
  if(!completed.length)return;
  if(!window.ExcelJS){toast("Não foi possível carregar o gerador de Excel. Atualize a página e tente novamente.");return}
  const button=$("export-csv"),previousLabel=button.textContent;button.disabled=true;button.textContent="Gerando Excel…";
  try{
    const workbook=new ExcelJS.Workbook();workbook.creator="Radar de Cursos";workbook.created=new Date();
    const sheet=workbook.addWorksheet("Tabela Modelo - Definição da Si",{views:[{state:"frozen",ySplit:1}]});
    const widths=[8.7109375,26.85546875,25.5703125,53.140625,12.85546875,13.140625,24.7109375,21.5703125,71.5703125,92.28515625,44,48.85546875,35.140625,20.42578125,46.140625,8.7109375];
    sheet.columns=["ORDEM","Tabela de Análise","Código do Curso","Curso","C. H.","Nível","Tipo de Curso","Estratégia","Justificativa","Situação do Curso","Áreas mapeadas","Área","Segmento de Área","Início de vigência","Alterar Segmento ou Área","OBSERVAÇÕES"].map((header,index)=>({header,key:`column${index+1}`,width:widths[index]}));
    const header=sheet.getRow(1);header.height=56.25;
    header.eachCell(cell=>{cell.font={name:"Aptos Narrow",size:14,bold:true,color:{argb:"FF000000"}};cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFFFFFFF"}};cell.alignment={horizontal:"center",vertical:"middle",wrapText:true};cell.border={top:{style:"thin",color:{argb:"FF808080"}},left:{style:"thin",color:{argb:"FF808080"}},bottom:{style:"thin",color:{argb:"FF808080"}},right:{style:"thin",color:{argb:"FF808080"}}}});
    completed.forEach((item,index)=>{
      const course=(window.COURSES_DATA||[]).find(entry=>String(entry.code)===String(item.code))||{};
      const newArea=item.changeType==="troca_area"?item.targetArea:"";
      const row=sheet.addRow([index+1,item.criterionKey==="fic"?"FIC":"Regular",String(item.code||""),item.name||course.name||"",course.hours??"",course.level||"",course.type||"",course.strategy||"",item.justification||"",String(item.result||"").toLocaleUpperCase("pt-BR"),mappedAreas(item),course.area||item.previousArea||"",course.segment||"",parseBrazilianDate(course.start),newArea,exportObservation(item)]);
      row.height=90;row.eachCell({includeEmpty:true},cell=>{cell.font={name:"Aptos Narrow",size:11};cell.alignment={vertical:"top",wrapText:true};cell.border={top:{style:"thin",color:{argb:"FFD9D9D9"}},left:{style:"thin",color:{argb:"FFD9D9D9"}},bottom:{style:"thin",color:{argb:"FFD9D9D9"}},right:{style:"thin",color:{argb:"FFD9D9D9"}}}});
      [1,3,5,6,8,14].forEach(column=>row.getCell(column).alignment={horizontal:"center",vertical:"top",wrapText:true});
      if(row.getCell(14).value instanceof Date)row.getCell(14).numFmt="dd/mm/yyyy";
    });
    sheet.autoFilter="B1:P1";sheet.pageSetup={orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9};
    const buffer=await workbook.xlsx.writeBuffer(),url=URL.createObjectURL(new Blob([buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
    const link=document.createElement("a");link.href=url;link.download=`Definição da Situação dos Cursos - ${new Date().toISOString().slice(0,10)}.xlsx`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(error){console.error(error);toast("Não foi possível gerar o Excel.")}
  finally{button.disabled=false;button.textContent=previousLabel}
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
$("history-search").oninput=render;$("export-csv").onclick=exportExcel;$("history-modal-close").onclick=closeHistory;$("history-modal-ok").onclick=closeHistory;$("history-modal").onclick=event=>{if(event.target===$("history-modal"))closeHistory()};
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&$("history-modal").classList.contains("open"))closeHistory()});
initialize();
