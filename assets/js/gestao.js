const $=id=>document.getElementById(id);
const normalize=text=>String(text||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const escapeHtml=text=>String(text??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
const toast=text=>{const element=$("toast");element.textContent=text;element.classList.add("show");setTimeout(()=>element.classList.remove("show"),2800)};
const formatDecisionResult=text=>{
  const value=String(text||"").trim().toLocaleLowerCase("pt-BR");
  return value?value.charAt(0).toLocaleUpperCase("pt-BR")+value.slice(1):"";
};
let completedEvaluations=[];
let analysisScope=[];

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
    const widths=[8.7109375,26.85546875,25.5703125,53.140625,12.85546875,13.140625,24.7109375,21.5703125,71.5703125,92.28515625,48.85546875,35.140625,20.42578125,46.140625,8.7109375];
    sheet.columns=["ORDEM","Tabela de Análise","Código do Curso","Curso","C. H.","Nível","Tipo de Curso","Estratégia","Justificativa","Situação do Curso","Área","Segmento de Área","Início de vigência","Alterar Segmento ou Área","OBSERVAÇÕES"].map((header,index)=>({header,key:`column${index+1}`,width:widths[index]}));
    const header=sheet.getRow(1);header.height=56.25;
    header.eachCell(cell=>{cell.font={name:"Aptos Narrow",size:14,bold:true,color:{argb:"FF000000"}};cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFFFFFFF"}};cell.alignment={horizontal:"center",vertical:"middle",wrapText:true};cell.border={top:{style:"thin",color:{argb:"FF808080"}},left:{style:"thin",color:{argb:"FF808080"}},bottom:{style:"thin",color:{argb:"FF808080"}},right:{style:"thin",color:{argb:"FF808080"}}}});
    scope.forEach((scopeItem,index)=>{
      const code=String(scopeItem.course_code),course=(window.COURSES_DATA||[]).find(item=>String(item.code)===code)||{},evaluation=latestCompleted.get(code),state=evaluation?.state||{};
      const criterionKey=evaluation?.criterion_key||scopeItem.criterion_key||course.criterion||"regular",pending=!evaluation;
      const row=sheet.addRow([index+1,criterionKey==="fic"?"FIC":"Regular",code,evaluation?.course_name||scopeItem.course_name||course.name||"",course.hours??"",course.level||"",course.type||"",course.strategy||"",pending?"PENDENTE DE ANÁLISE":evaluation.justification||"",pending?"PENDENTE DE ANÁLISE":String(evaluation.final_result||"NÃO INFORMADO").toLocaleUpperCase("pt-BR"),course.area||state.previousArea||"",course.segment||"",parseBrazilianDate(course.start),state.changeType==="troca_area"?state.targetArea||"":"",pending?"":evaluationObservations(evaluation)]);
      row.height=90;row.eachCell({includeEmpty:true},cell=>{cell.font={name:"Aptos Narrow",size:11};cell.alignment={vertical:"top",wrapText:true};cell.border={top:{style:"thin",color:{argb:"FFD9D9D9"}},left:{style:"thin",color:{argb:"FFD9D9D9"}},bottom:{style:"thin",color:{argb:"FFD9D9D9"}},right:{style:"thin",color:{argb:"FFD9D9D9"}}}});
      [1,3,5,6,8,13].forEach(column=>row.getCell(column).alignment={horizontal:"center",vertical:"top",wrapText:true});
      if(row.getCell(13).value instanceof Date)row.getCell(13).numFmt="dd/mm/yyyy";
      if(pending)row.eachCell(cell=>{cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFFFF2CC"}}});
    });
    sheet.autoFilter="B1:O1";sheet.pageSetup={orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9};
    const buffer=await workbook.xlsx.writeBuffer(),url=URL.createObjectURL(new Blob([buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
    const link=document.createElement("a");link.href=url;link.download=`Definição da Situação dos Cursos - ${new Date().toISOString().slice(0,10)}.xlsx`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(error){console.error(error);toast("Não foi possível gerar o Excel.")}
  finally{button.disabled=false;button.textContent=label}
}

async function initializeManager(){
  try{
    await requireSupabaseSession();
    if(isPreviewMode){location.replace("index.html");return}
    const [completed,claims,validations,scope]=await Promise.all([
      remoteDb.evaluations(["concluida"]),
      remoteDb.evaluationClaims(),
      remoteDb.validations(),
      remoteDb.analysisScope()
    ]);
    completedEvaluations=completed;
    analysisScope=scope;
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
