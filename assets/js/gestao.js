const $=id=>document.getElementById(id);
const normalize=text=>String(text||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const escapeHtml=text=>String(text??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
const toast=text=>{const element=$("toast");element.textContent=text;element.classList.add("show");setTimeout(()=>element.classList.remove("show"),2800)};
const formatDecisionResult=text=>{
  const value=String(text||"").trim().toLocaleLowerCase("pt-BR");
  return value?value.charAt(0).toLocaleUpperCase("pt-BR")+value.slice(1):"";
};
const SCENARIO_NAMES={1:"Desenvolvimento de software",2:"Redes e Infraestrutura",3:"Segurança Cibernética",4:"Cloud e DevOps",5:"Dados"};
const scenarioNamesFromText=text=>[...new Set((normalize(text).match(/cenarios?\s+mapeados?\s*\(([^)]+)\)/i)?.[1]?.match(/[1-5]/g)||[]).map(number=>SCENARIO_NAMES[number]))];
let completedEvaluations=[];
let analysisScope=[];
let proposals=[];
const PROPOSAL_STATUS_LABELS={rascunho:"Rascunho",submetida:"Registrada",em_analise:"Em análise",ajustes_solicitados:"Ajustes solicitados",aprovada_para_catalogo:"Pronta para catálogo",reprovada:"Não aprovada",arquivada:"Arquivada",cancelada:"Excluída"};
const courseHasEnded=course=>{const match=String(course?.end||"").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!match)return false;const today=new Date(),endKey=Number(`${match[3]}${match[2]}${match[1]}`),todayKey=Number(`${today.getFullYear()}${String(today.getMonth()+1).padStart(2,"0")}${String(today.getDate()).padStart(2,"0")}`);return endKey<=todayKey};
const endedCourseEvaluation=(course,evaluation,scopeItem)=>({...(evaluation||{}),course_code:String(course.code||scopeItem.course_code),course_name:evaluation?.course_name||scopeItem.course_name||course.name||"",criterion_key:evaluation?.criterion_key||scopeItem.criterion_key||course.criterion||"regular",criterion_label:evaluation?.criterion_label||(scopeItem.criterion_key==="fic"?"Critério FIC":"Critério Regular / Qualificação"),final_result:"FECHAR A VIGÊNCIA",justification:`Fechar a vigência porque a data de término registrada para o curso é ${course.end}.`,state:{...(evaluation?.state||{}),changeType:"fechar_vigencia_data_termino",closureReason:"data_termino",closureReasonLabel:`Data de término: ${course.end}`}});

function resultGroup(result){
  const value=normalize(result);
  if(value.includes("troca de area"))return "Troca de área";
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
  const items=completedEvaluations.filter(item=>normalize(`${item.course_name} ${item.course_code} ${item.final_result} ${item.state?.targetArea||""}`).includes(query)).slice(0,12);
  $("manager-table").innerHTML=items.length?`
    <div class="manager-table-head"><span>Curso</span><span>Critério</span><span>Decisão</span><span>Atualização</span></div>
    ${items.map(item=>`
      <div class="manager-table-row">
        <div><strong>${escapeHtml(item.course_name)}</strong><small>Código ${escapeHtml(item.course_code)}${item.state?.changeType==="troca_area"?` · Nova área: ${escapeHtml(item.state.targetArea||"Não informada")}`:""}</small></div>
        <span>${escapeHtml(item.criterion_label)}</span>
        <b class="manager-decision">${escapeHtml(formatDecisionResult(item.final_result)||"Não informado")}</b>
        <time>${new Date(item.updated_at).toLocaleDateString("pt-BR")}</time>
      </div>`).join("")}`:
    `<div class="manager-empty">Nenhuma análise encontrada.</div>`;
}

function parseBrazilianDate(value){
  const match=String(value||"").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!match)return value||"";
  return new Date(Number(match[3]),Number(match[2])-1,Number(match[1]));
}

function evaluationObservations(evaluation){
  const state=evaluation?.state||{};
  const notes=[state.observations,...Object.values(state.questionObservations||{}),...(state.decisionPath||state.answers||[]).map(step=>step?.observation)]
    .map(value=>String(value||"").trim()).filter(Boolean);
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
function mappedAreas(evaluation){
  if(!evaluation)return "PENDENTE DE ANÁLISE";
  const normalizedResult=normalize(evaluation.final_result);
  if(normalizedResult.includes("fechar"))return "FECHAR VIGÊNCIA";
  if(normalizedResult.includes("troca de area")||normalizedResult.includes("trocar area")||evaluation.state?.changeType==="troca_area")return "TROCA DE ÁREA";
  const titleAreas=mappedAreasByTitle(evaluation.course_name);
  if(normalizedResult.includes("manter")&&titleAreas.length)return titleAreas.join("; ");
  const state=evaluation.state||{},values=[];
  values.push(...(Array.isArray(state.mappedAreasByTitle)?state.mappedAreasByTitle:[]));
  (state.decisionPath||state.answers||[]).forEach(step=>values.push(...(step?.scenarios||[])));
  Object.values(state.scenarioSelections||{}).forEach(selected=>values.push(...(Array.isArray(selected)?selected:[])));
  const original=`${evaluation.justification||""} ${state.justificationOriginal||""}`,normalizedOriginal=normalize(original),numbers=[];
  for(const match of normalizedOriginal.matchAll(/cenarios?\s+mapeados?\s*\(([^)]+)\)/g))numbers.push(...(match[1].match(/[1-5]/g)||[]));
  for(const match of normalizedOriginal.matchAll(/cenario\s*([1-5])/g))numbers.push(match[1]);
  numbers.forEach(number=>values.push(MAPPED_AREA_NAMES[number]));
  const canonical=values.map(value=>{
    const key=normalize(value);
    if(key.includes("desenvolvimento"))return MAPPED_AREA_NAMES[1];
    if(key.includes("redes")||key.includes("infraestrutura"))return MAPPED_AREA_NAMES[2];
    if(key.includes("seguranca")||key.includes("cyber"))return MAPPED_AREA_NAMES[3];
    if(key.includes("cloud")||key.includes("devops")||key.includes("nuvem"))return MAPPED_AREA_NAMES[4];
    if(key.includes("dados"))return MAPPED_AREA_NAMES[5];
    return String(value||"").trim();
  }).filter(Boolean);
  const unique=[...new Set(canonical)];
  if(unique.length)return unique.join("; ");
  if(titleAreas.length)return titleAreas.join("; ");
  return normalizedOriginal.includes("nao responde")||normalizedOriginal.includes("nao foi relacionado")?"Nenhuma área mapeada":"Não informada";
}

function legacyFragments(text){
  const pieces=String(text||"").split(/[;\r\n]+/).map(value=>value.trim()).filter(Boolean),grouped=[];
  const starts=value=>/^(NÃO\s+)?(?:HOUVE|MAIS DE UMA ESCOLA|SOMENTE UMA ESCOLA|O CURSO|A ESCOLA|A CBO|É UMA|NÃO É UMA|O PERFIL|HÁ ALGUMA|NÃO HÁ ALGUMA|A TECNOLOGIA|O DESENHO|OS PADRÕES|É UM CURSO|POSSUI UNIDADES|A DATA|CURSO INATIVO|FORMAÇÃO)/i.test(value);
  pieces.forEach(piece=>{if(!grouped.length||starts(piece))grouped.push(piece);else grouped[grouped.length-1]+=` ${piece}`});
  return grouped;
}

function legacyStatement(raw){
  const text=normalize(raw),detail=String(raw).match(/[(:]\s*([^:)]+)\)?\s*$/)?.[1]?.trim(),withDetail=statement=>`${statement}${detail?` (${detail})`:""}`;
  if(text.includes("nao houve oferta continua"))return "Não foi confirmada oferta contínua no período analisado";
  if(text.includes("houve oferta continua"))return "Foi confirmada oferta contínua no período analisado";
  if(text.includes("nao houve oferta do curso em algum"))return "Não houve oferta nos anos considerados";
  if(text.includes("houve oferta do curso em algum"))return "Houve oferta em pelo menos um dos anos considerados";
  if(text.includes("mais de uma escola"))return withDetail("O título é ofertado por mais de uma escola");
  if(text.includes("somente uma escola"))return withDetail("O título possui oferta registrada em somente uma escola");
  if(text.includes("curso nao responde"))return "O curso não foi relacionado aos cenários estratégicos mapeados";
  if(text.includes("curso responde")){const scenarios=scenarioNamesFromText(raw);return `O curso está relacionado aos cenários estratégicos mapeados${scenarios.length?`: ${scenarios.join(", ")}`:""}`}
  if(text.includes("cbo")&&text.includes("nao tem empregabilidade"))return "Não foi identificada empregabilidade suficiente para as ocupações relacionadas";
  if(text.includes("cbo")&&text.includes("empregabilidade"))return withDetail("As ocupações relacionadas apresentam empregabilidade no mapa de emprego");
  if(text.includes("nao e uma qualificacao fic sem perfil"))return "A qualificação possui perfil profissional FIC";
  if(text.includes("e uma qualificacao fic sem perfil"))return "A qualificação FIC ainda não possui perfil profissional FIC";
  if(text.includes("perfil profissional nao tem mais de 4 anos"))return "O perfil profissional possui até quatro anos";
  if(text.includes("perfil profissional tem mais de 4 anos"))return "O perfil profissional possui mais de quatro anos";
  if(text.includes("nao ha alguma tecnologia"))return "Não foram identificadas tecnologias que precisem ser incluídas ou retiradas";
  if(text.includes("ha alguma tecnologia"))return withDetail("Foram identificadas tecnologias que precisam ser incluídas ou retiradas");
  if(text.includes("tecnologia")&&text.includes("altera o perfil"))return withDetail("A alteração tecnológica impacta o perfil profissional");
  if(text.includes("data de abertura")&&text.includes("nao esta entre"))return "A vigência foi aberta fora do período de 2024 a 2025";
  if(text.includes("data de abertura")&&text.includes("esta entre"))return "A vigência foi aberta entre 2024 e 2025";
  if(text.includes("escola nao tem uma justificativa")||text.includes("nao tem justificativa tecnica"))return "A escola não apresentou justificativa técnica suficiente para a manutenção do curso";
  if(text.includes("escola tem uma justificativa")&&String(raw).includes("?"))return "Foi registrada a necessidade de confirmar com a escola uma justificativa técnica para a manutenção do curso";
  if(text.includes("escola tem uma justificativa"))return "A escola apresentou justificativa técnica para a manutenção do curso";
  const clean=String(raw).replace(/[?;.]+$/g,"").trim().toLocaleLowerCase("pt-BR");
  return clean?clean.charAt(0).toLocaleUpperCase("pt-BR")+clean.slice(1):"";
}

function exportJustification(evaluation){
  const state=evaluation?.state||{},original=String(evaluation?.justification||"").trim();
  const isLegacy=Boolean(state.sourceId||state.imported)||/(^|\n)\s*(SIM|NÃO)\s+[—-]/i.test(original)||original.length>30&&original===original.toLocaleUpperCase("pt-BR");
  if(!isLegacy)return original;
  const path=state.decisionPath||state.answers||[],statements=path.length
    ?path.map(step=>legacyStatement(`${step.answer===false?"NÃO ":""}${step.text||""}`)).filter(Boolean)
    :legacyFragments(original).map(legacyStatement).filter(Boolean);
  const observation=String(state.observations||"").trim();
  return [`A análise do curso ${evaluation.course_name} foi conduzida conforme o ${evaluation.criterion_label}.`,statements.length?`${statements.join(". ")}.`:"Não há detalhamento suficiente do percurso na fonte original.",observation?`Como registro adicional, consta: ${observation}.`:"",evaluation.final_result?`Diante das evidências registradas, recomenda-se ${formatDecisionResult(evaluation.final_result).toLocaleLowerCase("pt-BR")}.`:""].filter(Boolean).join(" ").replace(/\s+/g," ").trim();
}

async function exportManagerWorkbook(){
  if(!analysisScope.length)return;
  if(!window.ExcelJS){toast("Não foi possível carregar o gerador de Excel. Atualize a página e tente novamente.");return}
  const button=$("manager-export"),label=button.textContent;button.disabled=true;button.textContent="Gerando Excel…";
  try{
    const latestCompleted=new Map();
    completedEvaluations.forEach(item=>{const code=String(item.course_code);if(!latestCompleted.has(code))latestCompleted.set(code,item)});
    const scope=analysisScope.filter(item=>item.is_analyzable).sort((a,b)=>String(a.course_name).localeCompare(String(b.course_name),"pt-BR"));
    const workbook=new ExcelJS.Workbook();workbook.creator="Radar de Cursos";workbook.created=new Date();
    const sheet=workbook.addWorksheet("Tabela Modelo - Definição da Si",{views:[{state:"frozen",ySplit:1}]});
    const widths=[8.7109375,26.85546875,25.5703125,53.140625,12.85546875,13.140625,24.7109375,21.5703125,71.5703125,92.28515625,44,48.85546875,35.140625,20.42578125,46.140625,8.7109375];
    sheet.columns=["ORDEM","Tabela de Análise","Código do Curso","Curso","C. H.","Nível","Tipo de Curso","Estratégia","Justificativa","Situação do Curso","Áreas mapeadas / Desfecho","Área","Segmento de Área","Início de vigência","Alterar Segmento ou Área","OBSERVAÇÕES"].map((header,index)=>({header,key:`column${index+1}`,width:widths[index]}));
    const header=sheet.getRow(1);header.height=56.25;
    header.eachCell(cell=>{cell.font={name:"Aptos Narrow",size:14,bold:true,color:{argb:"FF000000"}};cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFFFFFFF"}};cell.alignment={horizontal:"center",vertical:"middle",wrapText:true};cell.border={top:{style:"thin",color:{argb:"FF808080"}},left:{style:"thin",color:{argb:"FF808080"}},bottom:{style:"thin",color:{argb:"FF808080"}},right:{style:"thin",color:{argb:"FF808080"}}}});
    scope.forEach((scopeItem,index)=>{
      const code=String(scopeItem.course_code),course=(window.COURSES_DATA||[]).find(item=>String(item.code)===code)||{},savedEvaluation=latestCompleted.get(code),evaluation=courseHasEnded(course)?endedCourseEvaluation(course,savedEvaluation,scopeItem):savedEvaluation,state=evaluation?.state||{};
      const criterionKey=evaluation?.criterion_key||scopeItem.criterion_key||course.criterion||"regular",pending=!evaluation;
      const row=sheet.addRow([index+1,criterionKey==="fic"?"FIC":"Regular",code,evaluation?.course_name||scopeItem.course_name||course.name||"",course.hours??"",course.level||"",course.type||"",course.strategy||"",pending?"PENDENTE DE ANÁLISE":exportJustification(evaluation),pending?"PENDENTE DE ANÁLISE":String(evaluation.final_result||"NÃO INFORMADO").toLocaleUpperCase("pt-BR"),mappedAreas(evaluation),course.area||state.previousArea||"",course.segment||"",parseBrazilianDate(course.start),state.changeType==="troca_area"?state.targetArea||"":"",pending?"":evaluationObservations(evaluation)]);
      row.height=90;row.eachCell({includeEmpty:true},cell=>{cell.font={name:"Aptos Narrow",size:11};cell.alignment={vertical:"top",wrapText:true};cell.border={top:{style:"thin",color:{argb:"FFD9D9D9"}},left:{style:"thin",color:{argb:"FFD9D9D9"}},bottom:{style:"thin",color:{argb:"FFD9D9D9"}},right:{style:"thin",color:{argb:"FFD9D9D9"}}}});
      [1,3,5,6,8,14].forEach(column=>row.getCell(column).alignment={horizontal:"center",vertical:"top",wrapText:true});
      if(row.getCell(14).value instanceof Date)row.getCell(14).numFmt="dd/mm/yyyy";
      if(pending)row.eachCell(cell=>{cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFFFF2CC"}}});
    });
    sheet.autoFilter="B1:P1";sheet.pageSetup={orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9};

    const proposalSheet=workbook.addWorksheet("Propostas",{views:[{state:"frozen",ySplit:1}]});
    const proposalWidths=[46,16,26,24,18,18,14,30,34,34,30,60,40,30,14];
    proposalSheet.columns=["Curso","Situação","Área","Segmento","Tipo de Curso","Nível","Carga horária","Público-alvo","Áreas mapeadas","Cenários estratégicos","Unidades interessadas","Justificativa","Evidência de demanda","Tecnologias relacionadas","Atualizado em"].map((header,index)=>({header,key:`column${index+1}`,width:proposalWidths[index]}));
    const proposalHeader=proposalSheet.getRow(1);proposalHeader.height=30;
    proposalHeader.eachCell(cell=>{cell.font={name:"Aptos Narrow",size:12,bold:true,color:{argb:"FFFFFFFF"}};cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFC00000"}};cell.alignment={horizontal:"center",vertical:"middle",wrapText:true};cell.border={top:{style:"thin",color:{argb:"FF808080"}},left:{style:"thin",color:{argb:"FF808080"}},bottom:{style:"thin",color:{argb:"FF808080"}},right:{style:"thin",color:{argb:"FF808080"}}}});
    proposals.forEach(proposal=>{
      const row=proposalSheet.addRow([
        proposal.title||"",
        PROPOSAL_STATUS_LABELS[proposal.status]||proposal.status||"",
        proposal.area||"",
        proposal.segment||"",
        proposal.course_type||"",
        proposal.level||"",
        proposal.workload_hours?`${proposal.workload_hours} h`:"",
        proposal.target_audience||"",
        (proposal.mapped_areas||[]).join("; "),
        (proposal.strategic_scenarios||[]).join("; "),
        (proposal.interested_units||[]).join("; "),
        proposal.justification||"",
        proposal.demand_evidence||"",
        proposal.related_technologies||"",
        proposal.updated_at?new Date(proposal.updated_at).toLocaleDateString("pt-BR"):""
      ]);
      row.height=45;row.eachCell({includeEmpty:true},cell=>{cell.font={name:"Aptos Narrow",size:11};cell.alignment={vertical:"top",wrapText:true};cell.border={top:{style:"thin",color:{argb:"FFD9D9D9"}},left:{style:"thin",color:{argb:"FFD9D9D9"}},bottom:{style:"thin",color:{argb:"FFD9D9D9"}},right:{style:"thin",color:{argb:"FFD9D9D9"}}}});
      [2,7,15].forEach(column=>row.getCell(column).alignment={horizontal:"center",vertical:"top",wrapText:true});
    });
    proposalSheet.autoFilter="A1:O1";proposalSheet.pageSetup={orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9};

    const buffer=await workbook.xlsx.writeBuffer(),url=URL.createObjectURL(new Blob([buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
    const link=document.createElement("a");link.href=url;link.download=`Definição da Situação dos Cursos - ${new Date().toISOString().slice(0,10)}.xlsx`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(error){console.error(error);toast("Não foi possível gerar o Excel.")}
  finally{button.disabled=false;button.textContent=label}
}

async function initializeManager(){
  try{
    await requireSupabaseSession();
    if(isPreviewMode){location.replace("index.html");return}
    const [completed,claims,validations,scope,proposalRows]=await Promise.all([
      remoteDb.evaluations(["concluida"]),
      remoteDb.evaluationClaims(),
      remoteDb.validations(),
      remoteDb.analysisScope(),
      remoteDb.courseProposals()
    ]);
    completedEvaluations=completed;
    analysisScope=scope;
    proposals=proposalRows;
    const completedCodes=new Set(completed.map(item=>String(item.course_code)));
    const areaChanges=completed.filter(item=>item.state?.changeType==="troca_area"||normalize(item.final_result).includes("troca de area"));
    const openValidations=validations.filter(item=>item.status!=="concluido");
    const evaluationsInProgress=claims.filter(item=>item.status==="em_analise"&&!completedCodes.has(String(item.course_code)));
    $("kpi-completed").textContent=completed.length.toLocaleString("pt-BR");
    $("kpi-drafts").textContent=evaluationsInProgress.length.toLocaleString("pt-BR");
    $("kpi-open").textContent=openValidations.length.toLocaleString("pt-BR");
    $("kpi-validations").textContent=validations.filter(item=>item.status==="concluido").length.toLocaleString("pt-BR");
    $("kpi-area-changes").textContent=areaChanges.length.toLocaleString("pt-BR");
    $("manager-updated").textContent=new Date().toLocaleString("pt-BR");

    const results=Object.entries(completed.reduce((groups,item)=>{
      const key=resultGroup(item.final_result);groups[key]=(groups[key]||0)+1;return groups;
    },{})).sort((a,b)=>b[1]-a[1]);
    const criteria=Object.entries(completed.reduce((groups,item)=>{
      const key=item.criterion_label||"Não informado";groups[key]=(groups[key]||0)+1;return groups;
    },{})).sort((a,b)=>b[1]-a[1]);
    const targetAreas=Object.entries(areaChanges.reduce((groups,item)=>{
      const key=item.state?.targetArea||"Área não informada";groups[key]=(groups[key]||0)+1;return groups;
    },{})).sort((a,b)=>b[1]-a[1]);
    renderBars("result-bars",results);
    renderBars("criterion-bars",criteria);
    renderBars("area-change-bars",targetAreas);
    renderTable();
  }catch(error){
    handleSupabaseError(error);
    $("manager-updated").textContent="Não foi possível carregar";
    showSystemUnavailable();
  }
}

$("manager-search").oninput=renderTable;
$("manager-export").onclick=exportManagerWorkbook;
initializeManager();
