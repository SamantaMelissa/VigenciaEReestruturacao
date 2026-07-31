const $=id=>document.getElementById(id);
const normalize=text=>String(text||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const escapeHtml=text=>String(text??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
const coursesByCode=new Map((window.COURSES_DATA||[]).map(course=>[String(course.code),course]));
let pendingCourses=[];
let claimingCourse=false;

function toast(text){
  $("toast").textContent=text;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),3000);
}

function criterionLabel(course){
  return course?.criterion==="fic"?"Critério FIC":"Critério Regular / Qualificação";
}

function renderPending(){
  const query=normalize($("pending-search").value);
  const filter=$("pending-filter").value;
  const items=pendingCourses.filter(item=>
    (filter==="todos"||item.status===filter)&&
    normalize(`${item.course_name} ${item.course_code}`).includes(query)
  );
  $("pending-list").innerHTML=items.length?items.map(item=>{
    const course=coursesByCode.get(String(item.course_code));
    const ready=item.status==="retorno_disponivel";
    const inProgress=item.status==="em_andamento";
    const href=inProgress?`index.html?retomar=${encodeURIComponent(item.course_code)}`:`index.html?analisar=${encodeURIComponent(item.course_code)}`;
    return `<article class="pending-item ${item.status}">
      <div class="pending-item-code"><span>CÓDIGO</span><strong>${escapeHtml(item.course_code)}</strong></div>
      <div class="pending-item-main"><strong>${escapeHtml(item.course_name)}</strong><small>${escapeHtml(criterionLabel(course))}${course?.area?` · ${escapeHtml(course.area)}`:""}</small></div>
      <span class="pending-status">${ready?"Retorno disponível":inProgress?"Em andamento":"Não iniciada"}</span>
      ${ready
        ?`<button class="pending-action ready" type="button" data-claim-code="${escapeHtml(item.course_code)}">Assumir e continuar →</button>`
        :inProgress&&!item.canResume
        ?'<span class="pending-action unavailable">Em análise pela equipe</span>'
        :`<a class="pending-action" href="${href}">${inProgress?"Continuar análise":"Iniciar análise"} →</a>`}
    </article>`;
  }).join(""):`<div class="manager-empty">Nenhum curso encontrado com esses filtros.</div>`;
  document.querySelectorAll("[data-claim-code]").forEach(button=>button.onclick=()=>claimReady(button.dataset.claimCode,button));
}

async function claimReady(courseCode,button){
  if(claimingCourse)return;
  claimingCourse=true;button.disabled=true;button.textContent="Assumindo...";
  try{
    await remoteDb.claimReadyEvaluation(courseCode);
    location.href=`index.html?retomar=${encodeURIComponent(courseCode)}`;
  }catch(error){
    handleSupabaseError(error);
    toast(error?.message?.includes("assumido")?"Outro usuário já assumiu esta avaliação. A lista será atualizada.":"Não foi possível assumir esta avaliação.");
    setTimeout(()=>location.reload(),1200);
  }finally{claimingCourse=false}
}

async function initializePending(){
  try{
    await requireSupabaseSession();
    if(isPreviewMode){location.replace("index.html");return}
    const [scope,evaluations,claims]=await Promise.all([
      remoteDb.analysisScope(),
      remoteDb.evaluations(["rascunho","em_analise","concluida"]),
      remoteDb.evaluationClaims()
    ]);
    const completedCodes=new Set(evaluations.filter(item=>item.status==="concluida").map(item=>String(item.course_code)));
    const draftCodes=new Set(claims.map(item=>String(item.course_code)));
    const ownDraftCodes=new Set(claims.filter(item=>item.created_by===appSession.user.id).map(item=>String(item.course_code)));
    const readyCodes=new Set(claims.filter(item=>item.available_for_claim===true).map(item=>String(item.course_code)));
    const eligible=scope.filter(item=>item.is_analyzable);
    pendingCourses=eligible
      .filter(item=>!completedCodes.has(String(item.course_code)))
      .map(item=>({...item,status:readyCodes.has(String(item.course_code))?"retorno_disponivel":draftCodes.has(String(item.course_code))?"em_andamento":"nao_iniciada",canResume:ownDraftCodes.has(String(item.course_code))}))
      .sort((a,b)=>{
        const priority=item=>item.status==="retorno_disponivel"?0:item.status==="em_andamento"&&item.canResume?1:item.status==="em_andamento"?2:3;
        return priority(a)-priority(b)||a.course_name.localeCompare(b.course_name,"pt-BR");
      });
    const readyCount=pendingCourses.filter(item=>item.status==="retorno_disponivel").length;
    $("pending-ready-alert").hidden=readyCount===0;
    $("pending-ready-title").textContent=`${readyCount} ${readyCount===1?"avaliação aguarda":"avaliações aguardam"} continuidade da equipe`;
    $("pending-total").textContent=pendingCourses.length.toLocaleString("pt-BR");
    $("pending-new").textContent=pendingCourses.filter(item=>item.status==="nao_iniciada").length.toLocaleString("pt-BR");
    $("pending-progress").textContent=pendingCourses.filter(item=>["em_andamento","retorno_disponivel"].includes(item.status)).length.toLocaleString("pt-BR");
    $("pending-completed").textContent=eligible.filter(item=>completedCodes.has(String(item.course_code))).length.toLocaleString("pt-BR");
    $("pending-updated").textContent=new Date().toLocaleString("pt-BR");
    renderPending();
  }catch(error){
    handleSupabaseError(error);
    $("pending-updated").textContent="Não foi possível carregar";
    showSystemUnavailable();
  }
}

$("pending-search").oninput=renderPending;
$("pending-filter").onchange=renderPending;
initializePending();
