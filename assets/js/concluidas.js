const $=id=>document.getElementById(id);
const normalize=text=>String(text||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const escapeHtml=text=>String(text??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
const formatResult=text=>{const value=String(text||"").trim().toLocaleLowerCase("pt-BR");return value?value.charAt(0).toLocaleUpperCase("pt-BR")+value.slice(1):"Não informado"};
const formatUnit=code=>{const digits=String(code??"").replace(/\D/g,"");return digits.length===3?`${digits[0]}.${digits.slice(1)}`:String(code??"")};
let completed=[];
let activeHistoryId=null;

function parseImportedDecisionPath(justification){
  const fragments=String(justification||"").split(/[;\r\n]+/).map(text=>text.trim()).filter(Boolean);
  const startsDecision=text=>/^(NÃO\s+)?(?:HOUVE|MAIS DE UMA ESCOLA|SOMENTE UMA ESCOLA|O CURSO|A ESCOLA|A CBO|É UMA|NÃO É UMA|O PERFIL|HÁ ALGUMA|NÃO HÁ ALGUMA|A TECNOLOGIA|O DESENHO|OS PADRÕES|É UM CURSO|POSSUI UNIDADES|A DATA|CURSO INATIVO)/i.test(text);
  const grouped=[];
  fragments.forEach(fragment=>{
    if(!grouped.length||startsDecision(fragment))grouped.push(fragment);
    else grouped[grouped.length-1]=`${grouped[grouped.length-1]} ${fragment}`;
  });
  return grouped.map((text,index)=>({step:index+1,text,answer:null}));
}
function decisionStatement(item){
  if(typeof item.answer!=="boolean"){
    const source=String(item.text||"").replace(/[;?]+$/g,"").trim().toLocaleLowerCase("pt-BR")
      .replace(/\b(fic|cbo|ia|iot|cnct|uc|ucs)\b/gi,value=>value.toLocaleUpperCase("pt-BR"));
    return source?source.charAt(0).toLocaleUpperCase("pt-BR")+source.slice(1):"";
  }
  const text=normalize(item.text),yes=item.answer;
  let statement;
  if(text.includes("oferta continua"))statement=yes?"Foi confirmada oferta contínua no período analisado":"Não foi confirmada oferta contínua em todo o período analisado";
  else if(text.includes("oferta do curso em algum"))statement=yes?"Há registro de oferta em pelo menos um dos anos considerados":"Não há registro de oferta nos anos considerados";
  else if(text.includes("mais de uma escola"))statement=yes?"O título é ofertado por mais de uma escola":"O título possui oferta registrada em somente uma escola";
  else if(text.includes("cenarios mapeados"))statement=yes?"O curso está relacionado aos cenários estratégicos mapeados":"O curso não foi relacionado aos cenários estratégicos mapeados";
  else if(text.includes("justificativa tecnica"))statement=yes?"A escola apresentou justificativa técnica para a manutenção do curso":"A escola não apresentou justificativa técnica suficiente para a manutenção do curso";
  else if(text.includes("empregabilidade"))statement=yes?"As ocupações relacionadas apresentam empregabilidade no mapa de emprego":"Não foi identificada empregabilidade suficiente para as ocupações relacionadas";
  else if(text.includes("sem perfil profissional"))statement=yes?"A qualificação FIC ainda não possui perfil profissional FIC":"A qualificação possui perfil profissional FIC";
  else if(text.includes("perfil profissional tem mais de 4 anos"))statement=yes?"O perfil profissional possui mais de quatro anos":"O perfil profissional possui até quatro anos";
  else if(text.includes("tecnologia que necessita"))statement=yes?"Foram identificadas tecnologias que precisam ser incluídas ou retiradas":"Não foram identificadas tecnologias que precisem ser incluídas ou retiradas";
  else if(text.includes("altera o perfil profissional"))statement=yes?"A alteração tecnológica impacta o perfil profissional":"A alteração tecnológica não impacta o perfil profissional";
  else if(text.includes("desenho curricular esta vinculado"))statement=yes?"O desenho curricular está vinculado ao perfil profissional":"O desenho curricular precisa ser revisto para se vincular ao perfil profissional";
  else if(text.includes("padroes de desempenho"))statement=yes?"Os padrões de desempenho estão descritos como capacidades observáveis":"Os padrões de desempenho precisam ser reescritos como capacidades observáveis";
  else if(text.includes("aprendizagem ou tecnico"))statement=yes?"Trata-se de curso de aprendizagem ou técnico":"O curso não pertence às modalidades de aprendizagem ou técnico";
  else if(text.includes("unidades curriculares comuns"))statement=yes?"O curso possui unidades curriculares comuns":"O curso precisa incluir unidades curriculares comuns";
  else if(text.includes("data de abertura de vigencia"))statement=yes?"A vigência foi aberta entre 2024 e 2025":"A vigência foi aberta fora do período de 2024 a 2025";
  else statement=`A condição “${String(item.text||"").replace(/\?$/g,"")}” ${yes?"foi confirmada":"não foi confirmada"}`;
  return statement.replace(/\.+$/g,"").trim();
}
function buildDecisionNarrative(path,result,courseName,criterion,extraObservation=""){
  const statements=[];
  (path||[]).forEach(item=>{
    const statement=decisionStatement(item);
    if(statement)statements.push(`${statement}${item.scenarios?.length?`: ${item.scenarios.join(", ")}`:""}.`);
    if(item.answer===true&&normalize(item.text).includes("cenarios mapeados")&&!item.scenarios?.length)statements.push("O cenário específico não foi registrado.");
    if(item.observation){
      const itemText=normalize(item.text);
      if(itemText.includes("tecnologia que necessita"))statements.push(`Para subsidiar a decisão, foram registradas as seguintes tecnologias para inclusão ou retirada: ${item.observation}.`);
      else if(itemText.includes("justificativa tecnica"))statements.push(`A justificativa técnica registrada pela escola foi: ${item.observation}.`);
      else statements.push(`Como complemento técnico, foi registrado: ${item.observation}.`);
    }
  });
  const introduction=`A análise do curso ${courseName} foi conduzida conforme o ${criterion}.`;
  const evidence=statements.length?` ${statements.join(" ")}`:" Não há detalhamento suficiente do percurso na fonte original.";
  const extra=extraObservation?` Como registro adicional, consta: ${extraObservation}.`:"";
  const conclusion=result?` Diante das evidências registradas, recomenda-se ${formatResult(result).toLocaleLowerCase("pt-BR")}.`:"";
  return `${introduction}${evidence}${extra}${conclusion}`.replace(/\s+/g," ").trim();
}

function mapEvaluation(row){
  const state=row.state||{};
  return {id:row.id,code:row.course_code,name:row.course_name,criterionKey:row.criterion_key,criterion:row.criterion_label,result:row.final_result||"",justification:row.justification||"",date:new Date(row.updated_at).toLocaleString("pt-BR"),source:state.source||"Avaliação realizada no sistema",sourceId:state.sourceId,decisionPath:state.decisionPath||state.answers||[],scenarioSelections:state.scenarioSelections||{},mappedAreasByTitle:state.mappedAreasByTitle||[],mappedAreaAssignedManually:Boolean(state.mappedAreaAssignedAt),enrollments:state.enrollments||{},units:state.units||[],observations:state.observations||"",questionObservations:state.questionObservations||{},changeType:state.changeType||"",targetArea:state.targetArea||"",previousArea:state.previousArea||"",createdBy:row.created_by};
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
  activeHistoryId=item.id;
  const course=(window.COURSES_DATA||[]).find(entry=>String(entry.code)===String(item.code));
  $("history-modal-title").textContent=item.name;$("history-modal-code").textContent=`Código ${item.code} · ${item.source}`;
  $("history-result-strip").className=`history-result-strip ${resultClass(item.result)}`;
  $("history-result-strip").innerHTML=`<span>Decisão registrada</span><strong>${escapeHtml(formatResult(item.result))}</strong>`;
  const enrollments=Object.keys(item.enrollments).length?item.enrollments:(course?.enrollments||{}),units=item.units.length?item.units:(course?.unitCodes||[]);
  const areaDisplay=mappedAreas(item);
  $("history-overview").innerHTML=`<div><span>Critério aplicado</span><strong>${escapeHtml(item.criterion)}</strong></div><div><span>Origem</span><strong>${escapeHtml(item.source)}</strong></div><div><span>Área mapeada / Desfecho</span><strong>${escapeHtml(areaDisplay)}</strong></div><div><span>Matrículas disponíveis</span><strong>${Object.keys(enrollments).length?Object.entries(enrollments).map(([year,value])=>`${year}: ${Number(value).toLocaleString("pt-BR")}`).join(" · "):"Não registradas"}</strong></div><div><span>Unidades ofertantes</span><strong>${units.length?units.map(formatUnit).map(escapeHtml).join(", "):"Não registradas"}</strong></div>`;
  let processItems=(item.decisionPath||[]).map(step=>{
    const isAreaStep=normalize(step.text).includes("cenarios mapeados");
    const recordedScenarios=step.scenarios?.length?step.scenarios:(item.scenarioSelections?.[step.step]||[]);
    const scenarios=isAreaStep&&item.mappedAreasByTitle.length&&(item.mappedAreaAssignedManually||!recordedScenarios.length)?item.mappedAreasByTitle:recordedScenarios;
    return {...step,scenarios};
  });
  if(!processItems.length&&item.justification)processItems=parseImportedDecisionPath(item.justification);
  if(item.mappedAreasByTitle.length)processItems=processItems.map(step=>{
    const isAreaStep=normalize(step.text).includes("cenarios mapeados");
    return isAreaStep&&!step.scenarios?.length?{...step,scenarios:item.mappedAreasByTitle}:step;
  });
  const canEdit=item.createdBy===appSession.user.id||["gestor","admin"].includes(window.appProfile?.role);
  const canAssignArea=!normalize(item.result).includes("fechar")&&!normalize(item.result).includes("troca de area")&&item.changeType!=="troca_area";
  $("history-process-list").innerHTML=processItems.length?processItems.map((step,index)=>{const isAreaStep=normalize(step.text).includes("cenarios mapeados");return `<div class="process-step"><span>${step.step||index+1}</span><div><strong>${escapeHtml(decisionStatement(step))}</strong>${step.scenarios?.length?`<p class="process-scenarios"><b>Cenário${step.scenarios.length>1?"s":""} mapeado${step.scenarios.length>1?"s":""}:</b> ${step.scenarios.map(escapeHtml).join(", ")}${isAreaStep&&canAssignArea?' <button type="button" data-history-area-edit>Alterar área</button>':""}</p>`:""}${isAreaStep&&!step.scenarios?.length&&canAssignArea?`<p class="process-scenarios missing"><b>Área não informada.</b> <button type="button" data-history-area-edit>Incluir área</button></p>`:""}${step.observation?`<p class="process-observation"><b>${normalize(step.text).includes("tecnologia que necessita")?"Tecnologias para inclusão ou retirada":"Registro complementar"}:</b> ${escapeHtml(step.observation)}</p>`:""}</div></div>`}).join(""):`<div class="process-empty">O registro de origem não contém o detalhamento das perguntas percorridas.</div>`;
  const legacyQuestionnaire=/(^|\n)\s*(SIM|NÃO)\s+—/i.test(item.justification||"");
  const recordedScenarios=processItems.flatMap(step=>step.scenarios||[]);
  const justificationMissingScenario=recordedScenarios.some(scenario=>!normalize(item.justification).includes(normalize(scenario)));
  const executiveJustification=(item.sourceId||legacyQuestionnaire||justificationMissingScenario)?buildDecisionNarrative(processItems,item.result,item.name,item.criterion,item.observations):(item.justification||buildDecisionNarrative(processItems,item.result,item.name,item.criterion,item.observations));
  $("history-justification").innerHTML=`<details class="justification-disclosure" open><summary><span>Justificativa consolidada</span><small>Visualizar parecer</small></summary><div><p>${escapeHtml(executiveJustification).replace(/\n/g,"<br>")}</p></div></details>`;
  $("history-modal-edit").hidden=!canEdit;$("history-modal-edit").href=`index.html?historico=${encodeURIComponent(item.id)}`;
  $("history-modal-assign-area").hidden=!/^não informada$|^nenhuma área mapeada$/i.test(areaDisplay);
  $("history-modal").classList.add("open");$("history-modal").setAttribute("aria-hidden","false");document.body.classList.add("modal-open");
  document.querySelectorAll("[data-history-area-edit]").forEach(button=>button.onclick=openAssignArea);
}
function closeHistory(){activeHistoryId=null;$("history-modal").classList.remove("open");$("history-modal").setAttribute("aria-hidden","true");document.body.classList.remove("modal-open")}
async function reevaluateCourse(){
  const item=completed.find(entry=>String(entry.id)===String(activeHistoryId));if(!item)return;
  if(!confirm(`Reavaliar ${item.name}? As respostas e a decisão atuais serão apagadas para que o curso seja analisado novamente.`))return;
  const button=$("history-modal-reevaluate"),label=button.textContent;button.disabled=true;button.textContent="Preparando reavaliação…";
  try{
    await remoteDb.reopenCompletedEvaluation(item.id);
    location.href=`index.html?analisar=${encodeURIComponent(item.code)}`;
  }catch(error){if(!handleSupabaseError(error))toast("Não foi possível preparar a reavaliação.")}
  finally{button.disabled=false;button.textContent=label}
}
function openAssignArea(){
  if(!activeHistoryId)return;
  const item=completed.find(entry=>String(entry.id)===String(activeHistoryId));
  const current=item?.mappedAreasByTitle||[];
  $("assign-area-title").textContent=current.length?"Alterar áreas mapeadas":"Incluir áreas mapeadas";
  $("assign-area-options").querySelectorAll("[data-mapped-area]").forEach(button=>button.classList.toggle("selected",current.includes(button.dataset.mappedArea)));
  $("assign-area-save").disabled=!current.length;
  $("assign-area-modal").classList.add("open");$("assign-area-modal").setAttribute("aria-hidden","false");
}
function closeAssignArea(){
  $("assign-area-modal").classList.remove("open");$("assign-area-modal").setAttribute("aria-hidden","true");
}
async function saveAssignedArea(){
  const item=completed.find(entry=>String(entry.id)===String(activeHistoryId));
  const areas=[...$("assign-area-options").querySelectorAll("[data-mapped-area].selected")].map(button=>button.dataset.mappedArea);if(!item||!areas.length)return;
  const button=$("assign-area-save"),label=button.textContent;button.disabled=true;button.textContent="Salvando…";
  try{
    await remoteDb.assignEvaluationMappedAreas(item.id,areas);
    item.mappedAreasByTitle=areas;item.mappedAreaAssignedManually=true;closeAssignArea();openHistory(item.id);toast("Áreas atribuídas à avaliação.");
  }catch(error){
    console.error("Falha ao salvar áreas mapeadas",error);
    if(error?.code==="PGRST202"||/assign_evaluation_mapped_areas|schema cache/i.test(error?.message||""))toast("A função de áreas ainda não foi atualizada no Supabase. Execute o SQL de atribuição de áreas e tente novamente.");
    else if(!handleSupabaseError(error))toast("Não foi possível salvar as áreas selecionadas.");
  }
  finally{button.textContent=label;button.disabled=!$("assign-area-options").querySelector("[data-mapped-area].selected")}
}
function parseBrazilianDate(value){
  const match=String(value||"").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!match)return value||"";
  return new Date(Number(match[3]),Number(match[2])-1,Number(match[1]));
}
function exportObservation(item){
  const notes=[item.observations,...Object.values(item.questionObservations||{}),...(item.decisionPath||[]).map(step=>step.observation)].map(value=>String(value||"").trim()).filter(Boolean);
  return [...new Set(notes)].join("\n");
}
const MAPPED_AREA_NAMES={1:"Desenvolvimento de software",2:"Redes e Infraestrutura",3:"Segurança Cibernética",4:"Cloud e DevOps",5:"Dados"};
function mappedAreasByTitle(courseName){
  const title=normalize(courseName),areas=[];
  if(/cloud|nuvem|devops/.test(title))areas.push(MAPPED_AREA_NAMES[4]);
  if(/ciber|cyber|seguranca|pentest|forense|vulnerabilidade|lgpd/.test(title))areas.push(MAPPED_AREA_NAMES[3]);
  if(/banco de dados|data |dados|business intelligence|power bi|tableau|sql|excel|big data|analytics/.test(title))areas.push(MAPPED_AREA_NAMES[5]);
  if(/rede|infraestrutura|servidor|hardware|suporte tecnico|fibra optica|linux|windows/.test(title))areas.push(MAPPED_AREA_NAMES[2]);
  if(/desenvolv|programa|software|web|aplicativo|app |mobile|java|python|php|javascript|logica|algoritmo|iot|jogos digitais/.test(title))areas.push(MAPPED_AREA_NAMES[1]);
  return [...new Set(areas)];
}
function mappedAreas(item){
  const normalizedResult=normalize(item.result);
  if(normalizedResult.includes("fechar"))return "FECHAR VIGÊNCIA";
  if(normalizedResult.includes("troca de area")||normalizedResult.includes("trocar area")||item.changeType==="troca_area")return "TROCA DE ÁREA";
  if(item.mappedAreaAssignedManually&&item.mappedAreasByTitle.length)return item.mappedAreasByTitle.join("; ");
  const titleAreas=mappedAreasByTitle(item.name);
  if(normalizedResult.includes("manter")&&titleAreas.length)return titleAreas.join("; ");
  const values=[...(Array.isArray(item.mappedAreasByTitle)?item.mappedAreasByTitle:[])];
  (item.decisionPath||[]).forEach(step=>values.push(...(step?.scenarios||[])));
  Object.values(item.scenarioSelections||{}).forEach(selected=>values.push(...(Array.isArray(selected)?selected:[])));
  const original=String(item.justification||""),normalizedOriginal=normalize(original),numbers=[];
  for(const match of normalizedOriginal.matchAll(/cenarios?\s+mapeados?\s*\(([^)]+)\)/g))numbers.push(...(match[1].match(/[1-5]/g)||[]));
  for(const match of normalizedOriginal.matchAll(/cenario\s*([1-5])/g))numbers.push(match[1]);
  numbers.forEach(number=>values.push(MAPPED_AREA_NAMES[number]));
  const canonical=values.map(value=>{const key=normalize(value);if(key.includes("desenvolvimento"))return MAPPED_AREA_NAMES[1];if(key.includes("redes")||key.includes("infraestrutura"))return MAPPED_AREA_NAMES[2];if(key.includes("seguranca")||key.includes("cyber"))return MAPPED_AREA_NAMES[3];if(key.includes("cloud")||key.includes("devops")||key.includes("nuvem"))return MAPPED_AREA_NAMES[4];if(key.includes("dados"))return MAPPED_AREA_NAMES[5];return String(value||"").trim()}).filter(Boolean);
  const unique=[...new Set(canonical)];
  if(unique.length)return unique.join("; ");
  if(titleAreas.length)return titleAreas.join("; ");
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
    sheet.columns=["ORDEM","Tabela de Análise","Código do Curso","Curso","C. H.","Nível","Tipo de Curso","Estratégia","Justificativa","Situação do Curso","Áreas mapeadas / Desfecho","Área","Segmento de Área","Início de vigência","Alterar Segmento ou Área","OBSERVAÇÕES"].map((header,index)=>({header,key:`column${index+1}`,width:widths[index]}));
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
$("history-search").oninput=render;$("export-csv").onclick=exportExcel;$("history-modal-close").onclick=closeHistory;$("history-modal-ok").onclick=closeHistory;$("history-modal-assign-area").onclick=openAssignArea;$("history-modal-reevaluate").onclick=reevaluateCourse;$("assign-area-options").querySelectorAll("[data-mapped-area]").forEach(button=>button.onclick=()=>{button.classList.toggle("selected");$("assign-area-save").disabled=!$("assign-area-options").querySelector("[data-mapped-area].selected")});$("assign-area-save").onclick=saveAssignedArea;$("assign-area-close").onclick=closeAssignArea;$("assign-area-cancel").onclick=closeAssignArea;$("assign-area-modal").onclick=event=>{if(event.target===$("assign-area-modal"))closeAssignArea()};$("history-modal").onclick=event=>{if(event.target===$("history-modal"))closeHistory()};
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&$("history-modal").classList.contains("open"))closeHistory()});
initialize();
