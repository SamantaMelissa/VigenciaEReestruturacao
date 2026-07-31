const COURSES = window.COURSES_DATA || [];
const ANALYZABLE_COURSES = COURSES.filter(course=>String(course.creator||"").trim().toUpperCase()==="GED");
let analysisScopeCodes=new Set(ANALYZABLE_COURSES.map(course=>String(course.code)));
const CRITERIA = {
  regular: {
    label: "Regulares e Qualificação FIC",
    short: "Critério Regular / Qualificação",
    questions: {
      1:{text:"Houve oferta contínua do curso nos anos de 2021, 2022, 2023, 2024 e 2025?",yes:7,no:2},
      2:{text:"Houve oferta do curso em algum dos anos de 2023, 2024, 2025 e/ou 2026?",yes:3,no:4},
      3:{text:"Mais de uma escola oferta esse título?",yes:4,no:5},
      4:{text:"O curso responde a um dos cenários mapeados?",yes:6,no:6},
      5:{text:"A escola tem uma justificativa técnica para manter o curso?",hint:"Considere atendimento a empresa, demanda local ou outra necessidade formalizada com a coordenação.",yes:7,no:6},
      6:{text:"A CBO do curso ou as relacionadas têm empregabilidade no mapa de emprego?",yes:7,no:"FECHAR A VIGÊNCIA"},
      7:{text:"É uma Qualificação FIC sem perfil profissional FIC?",yes:"REESTRUTURAR PERFIL E DESENHO CURRICULAR",no:8},
      8:{text:"O perfil profissional tem mais de 4 anos?",yes:"REESTRUTURAR PERFIL E DESENHO CURRICULAR",no:9},
      9:{text:"Há alguma tecnologia que necessita ser incluída ou retirada do curso?",yes:10,no:11},
      10:{text:"A tecnologia incluída ou retirada altera o perfil profissional?",yes:"REESTRUTURAR PERFIL E DESENHO CURRICULAR",no:11},
      11:{text:"O desenho curricular está vinculado ao perfil — subfunção × unidade curricular?",yes:12,no:"REESTRUTURAR PERFIL E DESENHO CURRICULAR"},
      12:{text:"Os padrões de desempenho estão escritos como desempenhos observáveis (capacidades)?",yes:13,no:"REESTRUTURAR PERFIL E DESENHO CURRICULAR"},
      13:{text:"É um curso de aprendizagem ou técnico?",yes:14,no:"MANTER"},
      14:{text:"Possui unidades curriculares comuns?",yes:"MANTER",no:"INCLUIR UNIDADES CURRICULARES COMUNS"}
    }
  },
  fic: {
    label: "FIC — Aperfeiçoamento, Especialização e Iniciação",
    short: "Critério FIC",
    questions: {
      1:{text:"Houve oferta contínua do curso nos anos de 2022, 2023, 2024 e 2025?",yes:4,no:2},
      2:{text:"Houve oferta do curso em algum dos anos de 2024, 2025 e/ou 2026?",yes:3,no:4},
      3:{text:"Mais de uma escola oferta esse título?",yes:4,no:5},
      4:{text:"O curso responde a um dos cenários mapeados?",yes:6,no:"FECHAR A VIGÊNCIA"},
      5:{text:"A escola tem uma justificativa técnica para manter o curso?",hint:"Considere atendimento a empresa, demanda local ou outra necessidade formalizada com a coordenação.",yes:6,no:"FECHAR A VIGÊNCIA"},
      6:{text:"Há alguma tecnologia que necessita ser incluída ou retirada do curso?",yes:"REESTRUTURAR",no:7},
      7:{text:"A data de abertura de vigência do produto está entre 2024 e 2025?",yes:"MANTER",no:"REESTRUTURAR"}
    }
  }
};

let selectedCourse=null,currentQuestion=1,answers=[],finalResult="",questionObservations={},scenarioSelections={};
let existingAnalysis=null;
let editingEvaluation=null;
let activeHistoryId=null;
let scenarioFixItem=null;
let history=[];
let contactQueue=[];
let evaluationDrafts=[];
let savingResult=false;
let savingDraft=false;
const $=id=>document.getElementById(id);
const normalize=text=>(text||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const escapeHtml=text=>String(text??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const needsQuestionObservation=text=>{
  const value=normalize(text);
  return value.includes("alguma tecnologia")||value.includes("justificativa tecnica");
};
const senaiOffersUrl=courseName=>`https://www.sp.senai.br/cursos/0/0?pesquisa=${encodeURIComponent(String(courseName||"").toLocaleLowerCase("pt-BR"))}`;
const formatDecisionResult=text=>{
  const value=String(text||"").trim().toLocaleLowerCase("pt-BR");
  return value?value.charAt(0).toLocaleUpperCase("pt-BR")+value.slice(1):"";
};
const formatUnitCode=code=>{
  const digits=String(code??"").replace(/\D/g,"");
  return digits.length===3?`${digits[0]}.${digits.slice(1)}`:String(code??"");
};
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
  const text=normalize(item.text);
  const yes=item.answer;
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
    if(statement){
      const scenarioDetail=item.scenarios?.length?`: ${item.scenarios.join(", ")}`:"";
      statements.push(`${statement}${scenarioDetail}.`);
    }
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
  const conclusion=result?` Diante das evidências registradas, recomenda-se ${formatDecisionResult(result).toLocaleLowerCase("pt-BR")}.`:"";
  return `${introduction}${evidence}${extra}${conclusion}`.replace(/\s+/g," ").trim();
}
function mapRemoteEvaluation(row){
  const state=row.state||{};
  return {
    id:row.id,
    remoteId:row.id,
    date:new Date(row.updated_at).toLocaleString("pt-BR"),
    code:row.course_code,
    name:row.course_name,
    criterionKey:row.criterion_key,
    criterion:row.criterion_label,
    result:row.final_result||"",
    justification:row.justification||"",
    source:state.source||"Avaliação realizada no sistema",
    sourceId:state.sourceId,
    observations:state.observations||"",
    decisionPath:state.decisionPath||state.answers||[],
    enrollments:state.enrollments||{},
    units:state.units||[],
    currentQuestion:row.current_question,
    answers:state.answers||[],
    questionObservations:state.questionObservations||{},
    scenarioSelections:state.scenarioSelections||{},
    savedAt:row.updated_at,
    createdBy:row.created_by,
    rawState:state
  };
}
async function loadRemoteAppData(){
  const [completed,drafts,validations,analysisScope,answerEvidence]=await Promise.all([
    remoteDb.evaluations(["concluida"]),
    remoteDb.evaluations(["rascunho","em_analise"]),
    remoteDb.validations(),
    remoteDb.analysisScope(),
    remoteDb.evaluationAnswers()
  ]);
  const evidenceByEvaluation=new Map();
  answerEvidence.forEach(row=>{
    if(!evidenceByEvaluation.has(row.evaluation_id))evidenceByEvaluation.set(row.evaluation_id,new Map());
    evidenceByEvaluation.get(row.evaluation_id).set(Number(row.question_step),row.evidence||{});
  });
  [...completed,...drafts].forEach(row=>{
    const evidence=evidenceByEvaluation.get(row.id);if(!evidence)return;
    const state={...(row.state||{})};
    const path=state.decisionPath||state.answers||[];
    state.decisionPath=path.map(step=>{
      const savedEvidence=evidence.get(Number(step.step))||{};
      return {
        ...step,
        scenarios:step.scenarios?.length?step.scenarios:(savedEvidence.scenarios||[]),
        observation:step.observation||savedEvidence.observation||""
      };
    });
    state.scenarioSelections={...(state.scenarioSelections||{})};
    state.decisionPath.forEach(step=>{if(step.scenarios?.length)state.scenarioSelections[step.step]=step.scenarios});
    row.state=state;
  });
  history=completed.map(mapRemoteEvaluation);
  evaluationDrafts=drafts
    .filter(row=>row.created_by===appSession.user.id)
    .map(mapRemoteEvaluation);
  contactQueue=validations;
  analysisScopeCodes=new Set(analysisScope.filter(item=>item.is_analyzable).map(item=>String(item.course_code)));
  $("base-total").textContent=analysisScopeCodes.size;
}
function showView(id,step){
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===id));
  document.querySelectorAll(".steps li").forEach(li=>{
    const n=+li.dataset.step; li.classList.toggle("active",n===step); li.classList.toggle("done",n<step);
  });
  $("app-panel").scrollIntoView({behavior:"smooth",block:"start"});
}
function searchCourses(){
  const q=normalize($("course-search").value.trim()),box=$("search-results");
  $("clear-search").style.display=q?"block":"none";
  if(!q){box.style.display="none";$("search-empty").style.display="block";return}
  const terms=q.split(/\s+/);
  const matches=COURSES.filter(course=>analysisScopeCodes.has(String(course.code))).map(c=>{
    const hay=normalize(`${c.code} ${c.name} ${c.type}`);
    return {c,score:terms.reduce((s,t)=>s+(hay.includes(t)?1:0),0)+(normalize(c.name).startsWith(q)?3:0)};
  }).filter(x=>x.score>=terms.length).sort((a,b)=>b.score-a.score||a.c.name.localeCompare(b.c.name)).slice(0,8);
  $("search-empty").style.display=matches.length?"none":"block";
  $("search-empty").innerHTML=matches.length?"":`<div class="empty-illustration">?</div><strong>Curso não localizado na base 2026</strong><span>Revise o termo. Cursos não cadastrados devem seguir para análise de criação/inclusão.</span>`;
  box.style.display=matches.length?"block":"none";
  box.innerHTML=matches.map(({c})=>`<button class="result-row" data-code="${c.code}"><strong>${escapeHtml(c.name)}</strong><span>Código ${c.code} · ${escapeHtml(c.type)}</span><b>${c.criterion==="fic"?"FIC":"REGULAR"}</b></button>`).join("");
  box.querySelectorAll("button").forEach(btn=>btn.onclick=()=>selectCourse(btn.dataset.code));
}
function selectCourse(code){
  existingAnalysis=history.find(item=>String(item.code)===String(code))||null;
  if(existingAnalysis){
    $("existing-analysis-title").textContent=existingAnalysis.name;
    $("existing-analysis-result").textContent=formatDecisionResult(existingAnalysis.result);
    $("existing-analysis-date").textContent=`Registrada em ${existingAnalysis.date}`;
    $("existing-analysis-modal").classList.add("open");
    $("existing-analysis-modal").setAttribute("aria-hidden","false");
    return;
  }
  selectedCourse=COURSES.find(c=>c.code===code); if(!selectedCourse)return;
  const criterion=CRITERIA[selectedCourse.criterion];
  $("course-name").textContent=selectedCourse.name;
  $("course-code").textContent=`Código ${selectedCourse.code} · ${selectedCourse.strategy||"Estratégia não informada"}`;
  $("criterion-pill").textContent=criterion.short;
  const details=[["Tipo",selectedCourse.type],["Carga horária",selectedCourse.hours?`${selectedCourse.hours} h`:"—"],["Início da vigência",selectedCourse.start||"Não informado"],["Unidades ofertantes",selectedCourse.units||"Sem registro"]];
  $("course-details").innerHTML=details.map(d=>`<div class="detail"><span>${d[0]}</span><strong>${escapeHtml(d[1])}</strong></div>`).join("");
  const vals=Object.values(selectedCourse.enrollments),max=Math.max(...vals,1);
  $("year-bars").innerHTML=Object.entries(selectedCourse.enrollments).map(([year,value])=>`<div class="year-item"><span>${year}</span><strong>${value}</strong><i style="--w:${Math.max(value/max*100,value?7:0)}%"></i></div>`).join("");
  const active=vals.filter(v=>v>0).length;
  $("evidence-note").textContent=active===3?"Há matrículas em todos os anos disponíveis (2023–2025). A oferta anterior e 2026 ainda exigem confirmação.":active?`Há matrículas em ${active} dos 3 anos disponíveis. Confirme eventuais ofertas sem matrícula e dados de 2026.`:"Não há matrículas registradas entre 2023 e 2025 para este código.";
  showView("validate-view",2);
}
function startEvaluation(){
  currentQuestion=1;answers=[];finalResult="";questionObservations={};scenarioSelections={};
  $("save-progress").classList.remove("saved");$("save-progress").textContent="← Salvar e voltar";
  $("mini-code").textContent=selectedCourse.code;$("mini-name").textContent=selectedCourse.name;$("mini-criterion").textContent=CRITERIA[selectedCourse.criterion].label;
  $("course-offers-link").href=senaiOffersUrl(selectedCourse.name);
  showView("quiz-view",3);renderQuestion();
}
function suggestionFor(step){
  const e=selectedCourse.enrollments,units=selectedCourse.units;
  const years=[2023,2024,2025];
  const yearRows=years.map(year=>`
    <div class="evidence-row">
      <span class="evidence-year">${year}</span>
      <strong>${e[year].toLocaleString("pt-BR")} matrícula${e[year]===1?"":"s"}</strong>
      <i class="${e[year]>0?"has-data":"no-data"}">${e[year]>0?"Oferta registrada":"Sem matrícula"}</i>
    </div>`).join("");
  if(step===1){
    const continuous=years.every(year=>e[year]>0);
    return {
      title:"Matrículas encontradas na base",
      body:yearRows,
      conclusion:continuous
        ?"Há oferta registrada em 2023, 2024 e 2025. Confirme também os anos de 2021 e 2022 antes de responder."
        :"Não há continuidade em todos os anos disponíveis. Os dados de 2021 e 2022 não constam nesta aba e também precisam ser confirmados."
    };
  }
  if(step===2){
    const hasRecent=years.some(year=>e[year]>0);
    return {
      title:"Oferta recente identificada",
      body:yearRows,
      conclusion:hasRecent
        ?"Existe matrícula em pelo menos um dos anos disponíveis. Confirme apenas se também houve oferta em 2026."
        :"Não foram encontradas matrículas entre 2023 e 2025. Confirme se houve alguma oferta em 2026."
    };
  }
  if(step===3){
    const unitCodes=selectedCourse.unitCodes||[];
    const unitStatus=units>1?"Mais de uma escola":units===1?"Uma escola identificada":"Sem oferta identificada";
    return {
      title:"Unidades ofertantes identificadas",
      action:units<=1?`
        <a class="offer-verification-link" href="${senaiOffersUrl(selectedCourse.name)}" target="_blank" rel="noopener noreferrer">
          Pesquisar ofertas ↗
        </a>`:"",
      body:`
        <div class="evidence-row">
          <span class="evidence-year">TOTAL</span>
          <strong>${units||0} unidade${units===1?"":"s"}</strong>
          <i class="${units>0?"has-data":"no-data"}">${unitStatus}</i>
        </div>
        <div class="unit-codes-line">
          <span>Unidades</span>
          <strong>${unitCodes.length?unitCodes.map(code=>escapeHtml(formatUnitCode(code))).join(", "):"Nenhuma unidade identificada"}</strong>
        </div>`,
      conclusion:units>1
        ?"A base indica oferta por mais de uma unidade. Confirme se os registros correspondem ao mesmo título e período analisado."
        :units===1
          ?`A base identifica oferta pela unidade ${formatUnitCode(unitCodes[0])}. Antes de responder, confira no portal SENAI se existem outras ofertas atuais para o mesmo título.`
          :"A base não identifica escola ofertante para este código. Consulte o portal SENAI para verificar ofertas sem matrícula registrada."
    };
  }
  if(step===7&&selectedCourse.criterion==="fic"){
    const year=(selectedCourse.start.match(/\d{4}$/)||[])[0];
    const inRange=year==="2024"||year==="2025";
    return {
      title:"Vigência encontrada no cadastro",
      body:`<div class="evidence-row single"><span class="evidence-year">INÍCIO</span><strong>${escapeHtml(selectedCourse.start||"Não informado")}</strong><i class="${inRange?"has-data":"no-data"}">${inRange?"Dentro do período":"Fora do período"}</i></div>`,
      conclusion:selectedCourse.start
        ?`A vigência foi aberta em ${year||selectedCourse.start}. Use essa informação para confirmar a resposta.`
        :"A data de abertura não foi informada na base. Consulte o cadastro do produto antes de responder."
    };
  }
  const hint=CRITERIA[selectedCourse.criterion].questions[step].hint||"";
  return hint?{title:"Orientação para análise",body:"",conclusion:hint}:null;
}
function recommendedAnswer(step){
  const e=selectedCourse.enrollments,units=selectedCourse.units;
  const years=[2023,2024,2025];
  if(step===1){
    // A presença de ano sem matrícula comprova quebra na continuidade disponível.
    // Todos positivos ainda não comprovam 2021/2022, portanto não pré-seleciona "Sim".
    return years.some(year=>e[year]===0)?false:null;
  }
  if(step===2){
    // A pergunta usa "algum dos anos": um registro positivo já permite responder "Sim".
    const relevantYears=selectedCourse.criterion==="fic"?[2024,2025]:years;
    return relevantYears.some(year=>e[year]>0)?true:null;
  }
  if(step===3){
    return units>1?true:units===1?false:null;
  }
  if(step===7&&selectedCourse.criterion==="fic"&&selectedCourse.start){
    const year=(selectedCourse.start.match(/\d{4}$/)||[])[0];
    return year?year==="2024"||year==="2025":null;
  }
  return null;
}
function renderQuestion(){
  const criterion=CRITERIA[selectedCourse.criterion],q=criterion.questions[currentQuestion];
  if(currentQuestion===5)queueSchoolValidation();
  $("quiz-counter").textContent=`Pergunta ${answers.length+1}`;
  $("progress-bar").style.width=`${Math.min(92,(answers.length+1)/(selectedCourse.criterion==="fic"?7:14)*100)}%`;
  $("question-text").textContent=q.text;
  const asksForObservation=needsQuestionObservation(q.text);
  $("question-observation").classList.toggle("visible",asksForObservation);
  $("question-observation-text").placeholder=normalize(q.text).includes("justificativa tecnica")
    ?"Registre a justificativa técnica apresentada pela escola..."
    :"Registre quais tecnologias precisam ser incluídas ou retiradas...";
  $("question-observation-text").value=asksForObservation?(questionObservations[currentQuestion]||""):"";
  const asksForScenarios=currentQuestion===4;
  $("scenario-selector").classList.toggle("visible",asksForScenarios);
  document.querySelectorAll("[data-scenario]").forEach(button=>{
    const selected=(scenarioSelections[currentQuestion]||[]).includes(button.dataset.scenario);
    button.classList.toggle("selected",selected);
    button.setAttribute("aria-pressed",selected?"true":"false");
  });
  const suggestion=suggestionFor(currentQuestion);
  $("data-suggestion").innerHTML=suggestion
    ?`<div class="suggestion-title"><span>▦</span><strong>${suggestion.title}</strong>${suggestion.action||""}</div>${suggestion.body}<p>${suggestion.conclusion}</p>`
    :"";
  $("data-suggestion").classList.toggle("visible",!!suggestion);
  const recommended=recommendedAnswer(currentQuestion);
  document.querySelectorAll(".decision").forEach(button=>{
    const value=button.dataset.answer==="yes";
    const isRecommended=recommended!==null&&value===recommended;
    button.classList.toggle("recommended",isRecommended);
    button.setAttribute("aria-pressed",isRecommended?"true":"false");
    const oldBadge=button.querySelector(".recommendation-badge");
    if(oldBadge)oldBadge.remove();
    if(isRecommended){
      button.insertAdjacentHTML("beforeend",'<b class="recommendation-badge">Sugerido pela base</b>');
    }
  });
  $("quiz-back").style.visibility=answers.length?"visible":"hidden";
  $("answer-trail").innerHTML=answers.map((a,i)=>`<span>P${a.step} · ${a.answer?"SIM":"NÃO"}</span>`).join("");
}
function answer(value){
  const q=CRITERIA[selectedCourse.criterion].questions[currentQuestion];
  const scenarios=currentQuestion===4?[...(scenarioSelections[currentQuestion]||[])]:[];
  if(currentQuestion===4&&value&&!scenarios.length){toast("Selecione ao menos um cenário antes de confirmar Sim.");return}
  if(currentQuestion===4&&!value)scenarioSelections[currentQuestion]=[];
  const observation=needsQuestionObservation(q.text)
    ?$("question-observation-text").value.trim()
    :"";
  if(observation)questionObservations[currentQuestion]=observation;
  answers.push({step:currentQuestion,answer:value,text:q.text,observation,scenarios:value?scenarios:[]});
  if(currentQuestion===5){
    const contact=contactQueue.find(item=>(item.course_code||item.code)===selectedCourse.code&&item.status!=="concluido");
    if(contact){
      const contactUpdate={
        decision_trail:answers.map(a=>({step:a.step,answer:a.answer,text:a.text,scenarios:a.scenarios||[]})),
        school_answer:value,status:"concluido",concluded_at:new Date().toISOString()
      };
      supabaseClient.from("school_validations").update(contactUpdate).eq("id",contact.id).select().single()
        .then(({data,error})=>{
          if(error){handleSupabaseError(error);return}
          contactQueue=contactQueue.map(item=>item.id===data.id?data:item);updateContactBadge();
        });
    }
  }
  const next=value?q.yes:q.no;
  if(typeof next==="string"){finalResult=next;showResult();return}
  currentQuestion=next;
  $("save-progress").classList.remove("saved");$("save-progress").textContent="← Salvar e voltar";
  renderQuestion();
}
function backQuestion(){if(!answers.length)return;currentQuestion=answers.pop().step;$("save-progress").classList.remove("saved");$("save-progress").textContent="← Salvar e voltar";renderQuestion()}
function returnToLastQuestion(){
  if(!answers.length)return;
  currentQuestion=answers.pop().step;
  finalResult="";
  $("save-progress").classList.remove("saved");
  $("save-progress").textContent="← Salvar e voltar";
  showView("quiz-view",3);
  renderQuestion();
}
function showResult(){
  const resultClass=normalize(finalResult);
  $("result-title").textContent=formatDecisionResult(finalResult);
  $("result-title").style.color=resultClass.includes("fechar")?"var(--red)":resultClass.includes("reestruturar")?"var(--amber)":"var(--green)";
  $("result-subtitle").textContent="A recomendação foi produzida pelo caminho oficial e permanece editável antes do registro.";
  $("result-course").textContent=selectedCourse.name;$("result-criterion").textContent=CRITERIA[selectedCourse.criterion].short;$("result-count").textContent=answers.length;
  $("justification").value=buildDecisionNarrative(
    answers,
    finalResult,
    selectedCourse.name,
    CRITERIA[selectedCourse.criterion].short
  );
  $("save-result").disabled=false;
  $("save-result").textContent=editingEvaluation?"Atualizar avaliação":"Concluir e salvar";
  showView("result-view",4);
}
function reset(){selectedCourse=null;editingEvaluation=null;currentQuestion=1;answers=[];finalResult="";questionObservations={};scenarioSelections={};$("course-search").value="";searchCourses();showView("search-view",1)}
async function saveResult(){
  if(savingResult)return;
  savingResult=true;
  $("save-result").disabled=true;
  const saveResultLabel=$("save-result").textContent;
  $("save-result").textContent="Salvando...";
  try{
  if(isPreviewMode){toast("Modo de demonstração: a análise não será gravada.");return}
  const wasEditing=Boolean(editingEvaluation);
  if(!editingEvaluation){
    const {data:completed,error:completedError}=await supabaseClient.from("evaluations").select("*")
      .eq("course_code",selectedCourse.code).eq("status","concluida").order("updated_at",{ascending:false}).limit(1).maybeSingle();
    if(completedError){
      if(!handleSupabaseError(completedError))toast("Não foi possível conferir as análises existentes.");
      return;
    }
    if(completed){
      const mapped=mapRemoteEvaluation(completed);
      if(!history.some(item=>item.id===mapped.id))history.unshift(mapped);
      renderHistory();reset();
      toast("Este curso já possui uma análise concluída.");
      return;
    }
  }
  const localRecord={
    id:Date.now(),
    date:new Date().toLocaleString("pt-BR"),
    code:selectedCourse.code,
    name:selectedCourse.name,
    criterion:CRITERIA[selectedCourse.criterion].short,
    result:finalResult,
    justification:$("justification").value,
    source:"Avaliação realizada no sistema",
    decisionPath:answers.map(item=>({...item})),
    enrollments:{...selectedCourse.enrollments},
    units:[...(selectedCourse.unitCodes||[])]
  };
  const draft=evaluationDrafts.find(item=>item.code===selectedCourse.code);
  const {sourceId:discardedSourceId,imported:discardedImported,...preservedState}=editingEvaluation?.rawState||{};
  const payload={
    course_code:selectedCourse.code,
    course_name:selectedCourse.name,
    criterion_key:selectedCourse.criterion,
    criterion_label:CRITERIA[selectedCourse.criterion].short,
    status:"concluida",
    current_question:null,
    final_result:finalResult,
    justification:$("justification").value,
    completed_at:new Date().toISOString(),
    state:{...preservedState,decisionPath:localRecord.decisionPath,scenarioSelections:{...scenarioSelections},enrollments:localRecord.enrollments,units:localRecord.units,source:editingEvaluation?"Avaliação editada no sistema":localRecord.source,editedAt:editingEvaluation?new Date().toISOString():undefined},
    created_by:editingEvaluation?.createdBy||appSession.user.id
  };
  try{
    let saved;
    if(editingEvaluation?.remoteId){
      const {data,error}=await supabaseClient.from("evaluations").update(payload).eq("id",editingEvaluation.remoteId).select().single();
      if(error)throw error;saved=data;
    }else if(draft?.remoteId){
      const {data,error}=await supabaseClient.from("evaluations").update(payload).eq("id",draft.remoteId).select().single();
      if(error)throw error;saved=data;
    }else{
      const {data,error}=await supabaseClient.from("evaluations").insert(payload).select().single();
      if(error)throw error;saved=data;
    }
    if(answers.length){
      const rows=answers.map(item=>({
        evaluation_id:saved.id,question_step:item.step,question_text:item.text,answer:item.answer,
        source:item.step===5?"unidade":"usuario",answered_by:appSession.user.id,
        evidence:{
          ...(item.step<=3?{enrollments:selectedCourse.enrollments,units:selectedCourse.unitCodes||[]}:{}),
          ...(item.scenarios?.length?{scenarios:item.scenarios}:{}),
          ...(item.observation?{observation:item.observation}:{})
        }
      }));
      const {error}=await supabaseClient.from("evaluation_answers").upsert(rows,{onConflict:"evaluation_id,question_step"});
      if(error)throw error;
    }
    const mappedSaved=mapRemoteEvaluation(saved);
    if(editingEvaluation)history=history.map(item=>String(item.id)===String(saved.id)?mappedSaved:item);
    else history.unshift(mappedSaved);
    evaluationDrafts=evaluationDrafts.filter(item=>item.code!==selectedCourse.code);
    renderHistory();renderDrafts();
    $("save-result").disabled=true;
    reset();
    $("course-search").focus();
    toast(wasEditing?"Avaliação atualizada no banco compartilhado.":"Análise salva no banco compartilhado. Você já pode escolher outro curso.");
  }catch(error){if(!handleSupabaseError(error))toast("Não foi possível salvar no Supabase. Tente novamente.")}
  }finally{
    savingResult=false;
    if(selectedCourse){
      $("save-result").disabled=false;
      $("save-result").textContent=saveResultLabel;
    }
  }
}
function renderHistory(){
  const q=normalize($("history-search").value),items=history.filter(h=>normalize(`${h.name} ${h.code} ${h.result}`).includes(q));
  $("saved-total").textContent=history.length;
  $("history-list").innerHTML=items.length?items.map(h=>{
    const resultClass=normalize(h.result).includes("reestruturar")?"reestruturar":normalize(h.result).includes("fechar")?"fechar":"";
    const source=h.sourceId?"Planilha de definição":"Sistema";
    return `<article class="history-row" data-history-id="${h.id}">
      <span class="history-icon">◇</span>
      <div class="history-main"><span class="history-source">${source}</span><strong>${escapeHtml(h.name)}</strong><small>Código ${h.code} · ${escapeHtml(h.criterion)}</small></div>
      <div class="history-date"><span>Registrado em</span><strong>${escapeHtml(h.date)}</strong></div>
      <span class="status ${resultClass}">${escapeHtml(formatDecisionResult(h.result))}</span>
      <span class="history-open">Ver processo →</span>
      <button class="delete" data-id="${h.id}" title="Excluir">×</button>
    </article>`;
  }).join(""):`<div class="history-empty">Nenhuma análise concluída. As decisões finalizadas aparecerão aqui.</div>`;
  document.querySelectorAll("[data-history-id]").forEach(row=>row.onclick=()=>openHistory(row.dataset.historyId));
  document.querySelectorAll(".delete").forEach(btn=>btn.onclick=async event=>{
    event.stopPropagation();
    const id=btn.dataset.id,item=history.find(entry=>String(entry.id)===String(id));
    if(item?.remoteId){
      const {error}=await supabaseClient.from("evaluations").delete().eq("id",item.remoteId);
      if(error){if(!handleSupabaseError(error))toast("Somente administradores podem excluir esta decisão.");return}
    }
    history=history.filter(entry=>String(entry.id)!==String(id));
    renderHistory();
  });
}
function openHistory(id){
  const item=history.find(entry=>String(entry.id)===String(id));if(!item)return;
  activeHistoryId=item.id;
  const course=COURSES.find(entry=>entry.code===item.code);
  $("history-modal-title").textContent=item.name;
  $("history-modal-code").textContent=`Código ${item.code} · ${item.source||"Registro do sistema"}`;
  const resultClass=normalize(item.result).includes("reestruturar")?"reestruturar":normalize(item.result).includes("fechar")?"fechar":"manter";
  $("history-result-strip").className=`history-result-strip ${resultClass}`;
  $("history-result-strip").innerHTML=`<span>Decisão registrada</span><strong>${escapeHtml(formatDecisionResult(item.result))}</strong>`;
  const enrollments=item.enrollments||(course?course.enrollments:{});
  const units=item.units||(course?course.unitCodes:[]);
  $("history-overview").innerHTML=`
    <div><span>Critério aplicado</span><strong>${escapeHtml(item.criterion)}</strong></div>
    <div><span>Origem</span><strong>${escapeHtml(item.source||"Avaliação do sistema")}</strong></div>
    <div><span>Matrículas disponíveis</span><strong>${Object.keys(enrollments).length?Object.entries(enrollments).map(([year,value])=>`${year}: ${Number(value).toLocaleString("pt-BR")}`).join(" · "):"Não registradas"}</strong></div>
    <div><span>Unidades ofertantes</span><strong>${units&&units.length?units.map(formatUnitCode).map(escapeHtml).join(", "):"Não registradas"}</strong></div>`;
  let processItems=(item.decisionPath||[]).map(step=>({
    ...step,
    scenarios:step.scenarios?.length?step.scenarios:(item.scenarioSelections?.[step.step]||[])
  }));
  if(!processItems.length&&item.justification){
    processItems=parseImportedDecisionPath(item.justification);
  }
  const canEdit=item.createdBy===appSession.user.id||["gestor","admin"].includes(window.appProfile?.role);
  $("history-process-list").innerHTML=processItems.length?processItems.map((step,index)=>`
    <div class="process-step">
      <span>${step.step||index+1}</span>
      <div><strong>${escapeHtml(decisionStatement(step))}</strong>${step.scenarios?.length?`<p class="process-scenarios"><b>Cenário${step.scenarios.length>1?"s":""} mapeado${step.scenarios.length>1?"s":""}:</b> ${step.scenarios.map(escapeHtml).join(", ")}</p>`:""}${step.step===4&&step.answer===true&&!step.scenarios?.length?`<p class="process-scenarios missing"><b>Cenário não informado.</b>${canEdit?' <button type="button" id="history-scenario-edit">Informar cenário</button>':""}</p>`:""}${step.observation?`<p class="process-observation"><b>${normalize(step.text).includes("tecnologia que necessita")?"Tecnologias para inclusão ou retirada":"Registro complementar"}:</b> ${escapeHtml(step.observation)}</p>`:""}</div>
    </div>`).join(""):`<div class="process-empty">O registro de origem não contém o detalhamento das perguntas percorridas.</div>`;
  const legacyQuestionnaire=/(^|\n)\s*(SIM|NÃO)\s+—/i.test(item.justification||"");
  const recordedScenarios=processItems.flatMap(step=>step.scenarios||[]);
  const justificationMissingScenario=recordedScenarios.some(scenario=>!normalize(item.justification).includes(normalize(scenario)));
  const executiveJustification=(item.sourceId||legacyQuestionnaire||justificationMissingScenario)
    ?buildDecisionNarrative(processItems,item.result,item.name,item.criterion,item.observations)
    :(item.justification||buildDecisionNarrative(processItems,item.result,item.name,item.criterion,item.observations));
  $("history-justification").innerHTML=`
    <details class="justification-disclosure">
      <summary><span>Justificativa consolidada</span><small>Visualizar parecer</small></summary>
      <div><p>${escapeHtml(executiveJustification).replace(/\n/g,"<br>")}</p></div>
    </details>`;
  $("history-modal-edit").hidden=!canEdit;
  $("history-modal").classList.add("open");$("history-modal").setAttribute("aria-hidden","false");
  if($("history-scenario-edit"))$("history-scenario-edit").onclick=()=>editHistoryScenario(item);
}
function closeHistory(){activeHistoryId=null;$("history-modal").classList.remove("open");$("history-modal").setAttribute("aria-hidden","true")}
function editHistoryEvaluation(){
  const item=history.find(entry=>String(entry.id)===String(activeHistoryId));
  const course=item&&COURSES.find(entry=>String(entry.code)===String(item.code));
  if(!item||!course){toast("Não foi possível localizar este curso na base atual.");return}
  const canEdit=item.createdBy===appSession.user.id||["gestor","admin"].includes(window.appProfile?.role);
  if(!canEdit){toast("Você não tem permissão para editar esta avaliação.");return}
  editingEvaluation=item;
  selectedCourse=course;
  answers=(item.decisionPath||[]).filter(step=>typeof step.answer==="boolean").map(step=>({...step}));
  questionObservations=Object.fromEntries(answers.filter(step=>step.observation).map(step=>[step.step,step.observation]));
  scenarioSelections=Object.fromEntries(answers.filter(step=>step.scenarios?.length).map(step=>[step.step,[...step.scenarios]]));
  finalResult=item.result||"";
  currentQuestion=1;
  $("mini-code").textContent=course.code;
  $("mini-name").textContent=course.name;
  $("mini-criterion").textContent=CRITERIA[course.criterion].label;
  $("course-offers-link").href=senaiOffersUrl(course.name);
  closeHistory();
  if(answers.length&&finalResult){
    showResult();
    $("justification").value=item.justification||$("justification").value;
    toast("Avaliação aberta para edição. Volte às perguntas que deseja alterar.");
  }else{
    answers=[];finalResult="";
    showView("quiz-view",3);renderQuestion();
    toast("A avaliação importada não possui respostas detalhadas. Refaça o fluxo para atualizá-la.");
  }
}
function editHistoryScenario(item){
  scenarioFixItem=item;
  $("scenario-fix-options").querySelectorAll("button").forEach(button=>button.classList.toggle("selected",(item.scenarioSelections?.[4]||[]).includes(button.dataset.scenario)));
  $("scenario-fix-save").disabled=!$("scenario-fix-options").querySelector(".selected");
  $("scenario-fix-modal").classList.add("open");
  $("scenario-fix-modal").setAttribute("aria-hidden","false");
}
function closeScenarioFix(){
  scenarioFixItem=null;
  $("scenario-fix-modal").classList.remove("open");
  $("scenario-fix-modal").setAttribute("aria-hidden","true");
}
async function saveHistoryScenario(){
  if(!scenarioFixItem?.remoteId)return;
  const selected=[...$("scenario-fix-options").querySelectorAll("button.selected")].map(button=>button.dataset.scenario);
  if(!selected.length){toast("Selecione ao menos um cenário.");return}
  const button=$("scenario-fix-save");button.disabled=true;button.textContent="Salvando...";
  const item=scenarioFixItem;
  const path=(item.decisionPath||[]).map(step=>Number(step.step)===4?{...step,scenarios:selected}:step);
  const state={...(item.rawState||{}),decisionPath:path,scenarioSelections:{...(item.scenarioSelections||{}),4:selected},editedAt:new Date().toISOString()};
  const justification=buildDecisionNarrative(path,item.result,item.name,item.criterion,item.observations);
  try{
    const question=path.find(step=>Number(step.step)===4);
    const {error:answerError}=await supabaseClient.from("evaluation_answers").upsert({
      evaluation_id:item.remoteId,question_step:4,question_text:question?.text||"O curso responde a um dos cenários mapeados?",answer:true,
      source:"usuario",answered_by:appSession.user.id,evidence:{scenarios:selected}
    },{onConflict:"evaluation_id,question_step"});
    if(answerError)throw answerError;
    const {data,error}=await supabaseClient.from("evaluations").update({state,justification}).eq("id",item.remoteId).select().single();
    if(error)throw error;
    const updated=mapRemoteEvaluation(data);
    history=history.map(entry=>String(entry.remoteId)===String(item.remoteId)?updated:entry);
    closeScenarioFix();renderHistory();openHistory(updated.id);
    toast("Cenário salvo na avaliação.");
  }catch(error){if(!handleSupabaseError(error))toast("Não foi possível salvar o cenário. Tente novamente.")}
  finally{button.textContent="Salvar cenário";button.disabled=false}
}
function exportCsv(){
  if(!history.length){toast("Não há registros para exportar.");return}
  const rows=[["Data","Código","Curso","Critério","Resultado","Justificativa"],...history.map(h=>[h.date,h.code,h.name,h.criterion,formatDecisionResult(h.result),h.justification])];
  const csv="\ufeff"+rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(";")).join("\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download=`decisoes-cursos-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href);
}
async function saveDraft(){
  if(savingDraft)return;
  savingDraft=true;
  $("save-progress").disabled=true;
  const saveDraftLabel=$("save-progress").textContent;
  $("save-progress").textContent="Salvando...";
  try{
  if(isPreviewMode){toast("Modo de demonstração: o progresso não será gravado.");return}
  if(!selectedCourse)return;
  const draft={
    code:selectedCourse.code,
    criterionKey:selectedCourse.criterion,
    currentQuestion,
    answers:answers.map(a=>({...a})),
    savedAt:new Date().toISOString(),
    questionObservations:{...questionObservations},
    scenarioSelections:{...scenarioSelections}
  };
  const existing=evaluationDrafts.find(item=>item.code===draft.code);
  const payload={
    course_code:selectedCourse.code,course_name:selectedCourse.name,criterion_key:selectedCourse.criterion,
    criterion_label:CRITERIA[selectedCourse.criterion].short,status:"rascunho",current_question:currentQuestion,
    final_result:null,justification:null,created_by:appSession.user.id,
    state:{answers:draft.answers,questionObservations:draft.questionObservations,scenarioSelections:draft.scenarioSelections,enrollments:selectedCourse.enrollments,units:selectedCourse.unitCodes||[]}
  };
  try{
    let saved;
    if(existing?.remoteId){
      const {data,error}=await supabaseClient.from("evaluations").update(payload).eq("id",existing.remoteId).select().single();
      if(error)throw error;saved=data;
    }else{
      const {data,error}=await supabaseClient.from("evaluations").insert(payload).select().single();
      if(error)throw error;saved=data;
    }
    const mapped=mapRemoteEvaluation(saved),index=evaluationDrafts.findIndex(item=>item.code===draft.code);
    if(index>=0)evaluationDrafts[index]=mapped;else evaluationDrafts.unshift(mapped);
    renderDrafts();
    $("save-progress").classList.add("saved");$("save-progress").textContent="✓ Progresso salvo";
    $("course-search").value="";searchCourses();showView("search-view",1);
    toast("Progresso salvo no banco compartilhado.");
  }catch(error){if(!handleSupabaseError(error))toast("Não foi possível salvar o progresso.")}
  }finally{
    savingDraft=false;
    $("save-progress").disabled=false;
    if(selectedCourse&&!$("save-progress").classList.contains("saved"))$("save-progress").textContent=saveDraftLabel;
  }
}
function renderDrafts(){
  const valid=evaluationDrafts.filter(draft=>COURSES.some(course=>course.code===draft.code));
  if(valid.length!==evaluationDrafts.length){
    evaluationDrafts=valid;
  }
  $("analises-salvas").classList.add("visible");
  $("drafts-count").textContent=`${evaluationDrafts.length} ${evaluationDrafts.length===1?"análise salva":"análises salvas"}`;
  $("drafts-list").innerHTML=evaluationDrafts.length?evaluationDrafts.map(draft=>{
    const course=COURSES.find(item=>item.code===draft.code);
    return `<article class="draft-item">
      <div><strong>${escapeHtml(course.name)}</strong><small>Código ${course.code} · ${draft.answers.length} resposta${draft.answers.length===1?"":"s"} · salvo em ${new Date(draft.savedAt).toLocaleString("pt-BR")}</small></div>
      <button class="draft-resume" data-resume="${course.code}">Continuar →</button>
      <button class="draft-delete" data-draft-delete="${course.code}" title="Excluir rascunho">×</button>
    </article>`;
  }).join(""):`<div class="drafts-empty">Nenhuma análise salva. Ao usar “Salvar e voltar”, o curso aparecerá aqui para ser retomado.</div>`;
  document.querySelectorAll("[data-resume]").forEach(button=>button.onclick=()=>resumeDraft(button.dataset.resume));
  document.querySelectorAll("[data-draft-delete]").forEach(button=>button.onclick=()=>removeDraft(button.dataset.draftDelete,true));
}
function resumeDraft(code){
  const draft=evaluationDrafts.find(item=>item.code===code),course=COURSES.find(item=>item.code===code);
  if(!draft||!course)return;
  selectedCourse=course;currentQuestion=draft.currentQuestion;answers=draft.answers||[];finalResult=draft.finalResult||"";questionObservations=draft.questionObservations||{};scenarioSelections=draft.scenarioSelections||{};
  $("mini-code").textContent=course.code;$("mini-name").textContent=course.name;$("mini-criterion").textContent=CRITERIA[course.criterion].label;
  $("course-offers-link").href=senaiOffersUrl(course.name);
  $("save-progress").classList.remove("saved");$("save-progress").textContent="← Salvar e voltar";
  if(finalResult){showResult();toast("Retorno da unidade aplicado. Confira o veredito.");}
  else{showView("quiz-view",3);renderQuestion();toast("Retorno da unidade aplicado. Continue a análise.");}
}
async function removeDraft(code,notify){
  const target=evaluationDrafts.find(item=>item.code===code);
  if(target?.remoteId){
    const {error}=await supabaseClient.from("evaluations").delete().eq("id",target.remoteId);
    if(error){if(!handleSupabaseError(error))toast("Você não tem permissão para excluir este rascunho.");return}
  }
  const before=evaluationDrafts.length;
  evaluationDrafts=evaluationDrafts.filter(item=>item.code!==code);
  if(evaluationDrafts.length!==before){
    renderDrafts();
    if(notify)toast("Rascunho removido.");
  }
}
async function queueSchoolValidation(){
  if(isPreviewMode)return;
  const snapshot={
    code:selectedCourse.code,
    name:selectedCourse.name,
    criterionKey:selectedCourse.criterion,
    criterion:CRITERIA[selectedCourse.criterion].label,
    units:selectedCourse.unitCodes||[],
    enrollments:{...selectedCourse.enrollments},
    question:CRITERIA[selectedCourse.criterion].questions[5].text,
    trail:answers.map(a=>({step:a.step,answer:a.answer,text:a.text,scenarios:a.scenarios||[]})),
    updatedAt:new Date().toISOString()
  };
  try{
    const payload={
      course_code:snapshot.code,course_name:snapshot.name,criterion_key:snapshot.criterionKey,
      criterion_label:snapshot.criterion,units:snapshot.units,enrollments:snapshot.enrollments,
      reason_question:snapshot.question,decision_trail:snapshot.trail,status:"pendente",created_by:appSession.user.id
    };
    const remoteExisting=contactQueue.find(item=>item.course_code===snapshot.code&&item.status!=="concluido");
    let saved;
    if(remoteExisting?.id){
      const {data,error}=await supabaseClient.from("school_validations").update(payload).eq("id",remoteExisting.id).select().single();
      if(error)throw error;saved=data;
    }else{
      const {data,error}=await supabaseClient.from("school_validations").insert(payload).select().single();
      if(error)throw error;saved=data;
    }
    contactQueue=contactQueue.filter(item=>item.id!==saved.id);contactQueue.unshift(saved);
    updateContactBadge();
  }catch(error){if(!handleSupabaseError(error))toast("Não foi possível criar a validação com a unidade.")}
}
function updateContactBadge(){
  const pending=contactQueue.filter(item=>item.status==="pendente"||item.status==="em_contato").length;
  $("contact-count").textContent=pending;
}
function toast(text){$("toast").textContent=text;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2500)}

$("base-total").textContent=ANALYZABLE_COURSES.length;
$("course-search").addEventListener("input",searchCourses);
$("clear-search").onclick=()=>{$("course-search").value="";searchCourses();$("course-search").focus()};
document.querySelectorAll(".back-search").forEach(b=>b.onclick=reset);
$("start-evaluation").onclick=startEvaluation;
$("save-progress").onclick=saveDraft;
$("question-observation-text").oninput=event=>{
  questionObservations[currentQuestion]=event.target.value;
};
document.querySelectorAll(".scenario-options [data-scenario]").forEach(button=>button.onclick=()=>{
  const selected=new Set(scenarioSelections[currentQuestion]||[]);
  if(selected.has(button.dataset.scenario))selected.delete(button.dataset.scenario);
  else selected.add(button.dataset.scenario);
  scenarioSelections[currentQuestion]=[...selected];
  const isSelected=selected.has(button.dataset.scenario);
  button.classList.toggle("selected",isSelected);
  button.setAttribute("aria-pressed",isSelected?"true":"false");
});
document.querySelectorAll(".decision").forEach(b=>b.onclick=()=>answer(b.dataset.answer==="yes"));
$("quiz-back").onclick=backQuestion;$("restart").onclick=reset;$("result-back").onclick=returnToLastQuestion;$("save-result").onclick=saveResult;
$("history-search").oninput=renderHistory;$("export-csv").onclick=exportCsv;
$("history-modal-close").onclick=closeHistory;$("history-modal-ok").onclick=closeHistory;
$("history-modal-edit").onclick=editHistoryEvaluation;
$("history-modal").onclick=event=>{if(event.target===$("history-modal"))closeHistory()};
$("scenario-fix-options").querySelectorAll("button").forEach(button=>button.onclick=()=>{
  button.classList.toggle("selected");
  $("scenario-fix-save").disabled=!$("scenario-fix-options").querySelector(".selected");
});
$("scenario-fix-save").onclick=saveHistoryScenario;
$("scenario-fix-close").onclick=closeScenarioFix;
$("scenario-fix-cancel").onclick=closeScenarioFix;
$("scenario-fix-modal").onclick=event=>{if(event.target===$("scenario-fix-modal"))closeScenarioFix()};
$("existing-analysis-close").onclick=()=>{
  existingAnalysis=null;
  $("existing-analysis-modal").classList.remove("open");
  $("existing-analysis-modal").setAttribute("aria-hidden","true");
};
$("existing-analysis-open").onclick=()=>{
  if(!existingAnalysis)return;
  const id=existingAnalysis.id;
  $("existing-analysis-close").click();
  openHistory(id);
};
$("existing-analysis-modal").onclick=event=>{
  if(event.target===$("existing-analysis-modal"))$("existing-analysis-close").click();
};
$("saved-analyses-link").onclick=event=>{
  event.preventDefault();
  $("course-search").value="";searchCourses();showView("search-view",1);
  requestAnimationFrame(()=>$("analises-salvas").scrollIntoView({behavior:"smooth",block:"start"}));
};
async function initializeApp(){
  try{
    await requireSupabaseSession();
    if(!isPreviewMode)await loadRemoteAppData();
    renderHistory();updateContactBadge();renderDrafts();
    const parameters=new URLSearchParams(location.search);
    const resumeFromContact=parameters.get("retomar");
    if(resumeFromContact&&evaluationDrafts.some(draft=>draft.code===resumeFromContact))resumeDraft(resumeFromContact);
    const courseToAnalyze=parameters.get("analisar");
    if(courseToAnalyze&&analysisScopeCodes.has(String(courseToAnalyze)))selectCourse(courseToAnalyze);
  }catch(error){
    handleSupabaseError(error);
    showSystemUnavailable();
  }
}
initializeApp();
