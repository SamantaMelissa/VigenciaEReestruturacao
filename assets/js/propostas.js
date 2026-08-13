const $=id=>document.getElementById(id);
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
const normalize=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const statusLabels={rascunho:"Rascunho",submetida:"Aguardando análise",em_analise:"Em análise",ajustes_solicitados:"Ajustes solicitados",aprovada_para_catalogo:"Pronta para catálogo",reprovada:"Não aprovada",arquivada:"Arquivada",cancelada:"Cancelada"};
const managerStatuses=["em_analise","ajustes_solicitados","aprovada_para_catalogo","reprovada","arquivada"];
const catalog=Array.isArray(window.COURSES_DATA)?window.COURSES_DATA:[];
const MAPPED_AREAS={development:"Desenvolvimento de software",network:"Redes e Infraestrutura",security:"Segurança Cibernética",cloud:"Cloud e DevOps",data:"Dados"};
let proposals=[],editingProposal=null,reviewingProposal=null,detailProposal=null,cancellingProposal=null,proposalStep=1;
const isManager=()=>["gestor","admin"].includes(window.appProfile?.role);
const cancellableStatuses=["rascunho","submetida","em_analise","ajustes_solicitados","reprovada"];
const canCancel=item=>cancellableStatuses.includes(item.status)&&(isManager()||ownedByCurrentUser(item));
const toast=message=>{const element=$("toast");element.textContent=message;element.classList.add("show");setTimeout(()=>element.classList.remove("show"),2800)};
const splitList=value=>String(value||"").split(",").map(item=>item.trim()).filter(Boolean);
const formatDate=value=>value?new Date(value).toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"}):"Não informado";
const ownedByCurrentUser=item=>item.created_by===window.appSession?.user?.id;
const editable=item=>ownedByCurrentUser(item)&&["rascunho","ajustes_solicitados"].includes(item.status);
const words=value=>normalize(value).split(/[^a-z0-9]+/).filter(word=>word.length>2);

function setSelectOptions(name,values){
  const select=document.querySelector(`[name="${name}"]`);if(!select)return;
  const selected=select.value;
  select.innerHTML=`<option value="">Selecione ${name==="area"?"a área":name==="segment"?"o segmento":name==="level"?"o nível":"o tipo"}</option>${values.map(value=>`<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
  if(selected)select.value=selected;
}
function ensureSelectValue(name,value){
  const select=document.querySelector(`[name="${name}"]`);if(!select||!value)return;
  if(![...select.options].some(option=>option.value===value))select.insertAdjacentHTML("beforeend",`<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`);
  select.value=value;
}
function populateCatalogOptions(){
  const unique=key=>[...new Set(catalog.map(item=>String(item[key]||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  setSelectOptions("area",unique("area"));setSelectOptions("segment",unique("segment"));setSelectOptions("course_type",unique("type"));setSelectOptions("level",unique("level"));
  $("course-title-options").innerHTML=catalog.map(item=>`<option value="${escapeHtml(item.name)}"></option>`).join("");
}
function closestCatalogCourse(title){
  const candidate=normalize(title);if(candidate.length<4)return null;
  const exact=catalog.find(item=>normalize(item.name)===candidate);if(exact)return exact;
  const candidateWords=words(candidate);if(!candidateWords.length)return null;
  const ranked=catalog.map(item=>{
    const name=normalize(item.name),nameWords=words(name),matches=candidateWords.filter(word=>nameWords.includes(word)).length;
    const coverage=matches/candidateWords.length,precision=matches/Math.max(1,nameWords.length);
    const prefix=name.startsWith(candidate)||candidate.startsWith(name)?0.35:0;
    return {item,score:coverage*.72+precision*.28+prefix};
  }).sort((a,b)=>b.score-a.score);
  return ranked[0]?.score>=.62?ranked[0].item:null;
}
function mappedAreasByTitle(title){
  const normalized=normalize(title),areas=[];
  if(/cloud|nuvem|devops/.test(normalized))areas.push(MAPPED_AREAS.cloud);
  if(/ciber|cyber|seguranca|pentest|forense|vulnerabilidade|lgpd/.test(normalized))areas.push(MAPPED_AREAS.security);
  if(/banco de dados|data |dados|business intelligence|power bi|tableau|sql|excel|big data|analytics/.test(normalized))areas.push(MAPPED_AREAS.data);
  if(/rede|infraestrutura|servidor|hardware|suporte tecnico|fibra optica|linux|windows/.test(normalized))areas.push(MAPPED_AREAS.network);
  if(/desenvolv|programa|software|web|aplicativo|app |mobile|java|python|php|javascript|logica|algoritmo|iot|jogos digitais/.test(normalized))areas.push(MAPPED_AREAS.development);
  return [...new Set(areas)];
}

function renderMappedAreaChips(selectedAreas=[]){
  const container=$("proposal-mapped-area-chips");
  const selected=new Set(selectedAreas);
  container.innerHTML=selectedAreas.map(area=>`<span class="chip" data-area="${escapeHtml(area)}" role="listitem">${escapeHtml(area)}<button type="button" class="chip-remove" aria-label="Remover ${escapeHtml(area)}">×</button></span>`).join("");
  container.querySelectorAll(".chip-remove").forEach(btn=>btn.onclick=e=>{e.stopPropagation();const area=btn.parentElement.dataset.area;document.querySelector(`[name="mapped_areas"][value="${area}"]`).checked=false;renderMappedAreaChips([...document.querySelectorAll('[name="mapped_areas"]:checked')].map(i=>i.value));validateField($("proposal-form").elements.mapped_areas[0])});
}
function setMappedAreas(values=[]){
  const selected=new Set(values||[]);
  document.querySelectorAll('[name="mapped_areas"]').forEach(input=>{input.checked=selected.has(input.value)});
  renderMappedAreaChips(values||[]);
}

function applyCatalogClassification(){
  const title=$("proposal-form").elements.title.value;
  const match=closestCatalogCourse(title);
  const hint=$("proposal-catalog-hint");
  const autoAreas=mappedAreasByTitle(title);
  const currentChips=[...document.querySelectorAll("#proposal-mapped-area-chips .chip")].map(c=>c.dataset.area);
  const merged=[...new Set([...autoAreas,...currentChips])];
  setMappedAreas(merged);
  if(!match){
    hint.textContent="Selecione uma classificação do catálogo ou continue digitando para buscar uma referência.";
    hint.className="catalog-hint";
    return;
  }
  ensureSelectValue("area",match.area);
  ensureSelectValue("segment",match.segment);
  ensureSelectValue("course_type",match.type);
  ensureSelectValue("level",match.level);
  hint.innerHTML=`Classificação preenchida com base em <strong>${escapeHtml(match.name)}</strong> (código ${escapeHtml(match.code)}).`;
  hint.className="catalog-hint success";
  toast(`Classificação preenchida a partir de "${match.name}"`);
}

function checkDuplicateProposal(title){
  if(!title||!editingProposal)return;
  const duplicate=proposals.find(p=>p.id!==editingProposal.id&&ownedByCurrentUser(p)&&normalize(p.title)===normalize(title.trim()));
  $("proposal-duplicate-warning").hidden=!duplicate;
}

function validateField(input){
  if(!input)return true;
  const name=input.name;
  if(name==="mapped_areas"){
    const checked=[...document.querySelectorAll('[name="mapped_areas"]:checked')].length>0;
    input.setCustomValidity(checked?"":"Selecione ao menos uma área mapeada.");
    return checked;
  }
  if(input.required&&!input.value.trim()){
    input.setCustomValidity("Campo obrigatório.");
    return false;
  }
  if(input.type==="number"&&input.min&&input.value&&Number(input.value)<Number(input.min)){
    input.setCustomValidity(`Valor mínimo: ${input.min}.`);
    return false;
  }
  input.setCustomValidity("");
  return true;
}

function validateFormForSubmit(){
  const form=$("proposal-form");
  const requiredFields=[...form.querySelectorAll("[required]")];
  const mappedChecked=[...form.querySelectorAll('[name="mapped_areas"]:checked')].length>0;
  let valid=true;
  requiredFields.forEach(input=>{if(!validateField(input))valid=false;});
  if(!mappedChecked){
    form.querySelector('[name="mapped_areas"]').setCustomValidity("Selecione ao menos uma área mapeada.");
    valid=false;
  }
  const workload=form.elements.workload_hours;
  if(workload.value&&Number(workload.value)<1){
    workload.setCustomValidity("Informe uma carga horária válida.");
    valid=false;
  }
  return valid;
}

function validateStep(step){
  const form=$("proposal-form");
  const stepRoot=form.querySelector(`.proposal-wizard-step[data-step="${step}"]`);
  if(!stepRoot)return true;
  const requiredFields=[...stepRoot.querySelectorAll("[required]")];
  let valid=true;
  requiredFields.forEach(input=>{if(!validateField(input))valid=false;});
  if(step===1){
    const mappedInputs=[...form.querySelectorAll('[name="mapped_areas"]')];
    const hasMapped=mappedInputs.some(input=>input.checked);
    mappedInputs[0]?.setCustomValidity(hasMapped?"":"Selecione ao menos uma área mapeada.");
    if(!hasMapped)valid=false;
  }
  if(!valid){
    $("proposal-form-feedback").textContent="Revise os campos destacados para continuar.";
  }
  return valid;
}

function renderProposalStep(step){
  proposalStep=step;
  document.querySelectorAll(".proposal-wizard-step").forEach(s=>s.classList.toggle("active",Number(s.dataset.step)===step));
  document.querySelectorAll(".proposal-steps span").forEach(s=>{
    const n=Number(s.dataset.proposalStep);
    s.classList.toggle("active",n===step);
    s.classList.toggle("done",n<step);
  });
  $("proposal-progress-bar").style.width=`${step/3*100}%`;
  $("proposal-prev").hidden=step===1;
  $("proposal-next").hidden=step===3;
  $("proposal-submit").hidden=step!==3;
  $("proposal-form-feedback").textContent="";
  $("proposal-modal-body")?.scrollTo({top:0});
}

function populateStatusOptions(){
  $("proposal-status-filter").insertAdjacentHTML("beforeend",Object.entries(statusLabels).map(([key,label])=>`<option value="${key}">${label}</option>`).join(""));
  $("proposal-review-status").innerHTML=managerStatuses.map(key=>`<option value="${key}">${statusLabels[key]}</option>`).join("");
}

function render(){
  const mine=proposals.filter(ownedByCurrentUser),query=normalize($("proposal-search").value),status=$("proposal-status-filter").value;
  const visible=(isManager()?proposals:mine).filter(item=>!status||item.status===status).filter(item=>normalize(`${item.title} ${item.area} ${item.segment}`).includes(query));
  $("proposal-mine-count").textContent=mine.length;
  $("proposal-pending-count").textContent=proposals.filter(item=>["submetida","em_analise"].includes(item.status)).length;
  $("proposal-approved-count").textContent=proposals.filter(item=>item.status==="aprovada_para_catalogo").length;
  document.querySelectorAll(".manager-proposal-kpi").forEach(element=>element.hidden=!isManager());
  $("proposal-list-kicker").textContent=isManager()?"FILA DA EQUIPE":"ACOMPANHAMENTO PESSOAL";
  $("proposal-list-title").textContent=isManager()?"Propostas para análise":"Minhas propostas";
  $("proposal-list").innerHTML=visible.length?visible.map(item=>{
    const cancelled=item.status==="cancelada";
    const mapped=item.mapped_areas?.length?`<span class="proposal-item-tags">${item.mapped_areas.map(area=>`<span>${escapeHtml(area)}</span>`).join("")}</span>`:"";
    const cancellation=item.cancellation_reason?`<small class="proposal-item-cancel-reason">Motivo: ${escapeHtml(item.cancellation_reason)}</small>`:"";
    const primary=cancelled
      ?`<span class="proposal-status ${item.status}">${statusLabels[item.status]}</span>`
      :isManager()
        ?`<button type="button" class="proposal-item-action" data-review="${item.id}">Analisar <span>→</span></button>`
        :canCancel(item)
          ?`<button type="button" class="proposal-item-action danger" data-cancel="${item.id}">Cancelar proposta</button>`
          :`<span class="proposal-status ${item.status}">${statusLabels[item.status]}</span>`;
    const tools=`<div class="proposal-item-tools">${editable(item)?`<button class="proposal-card-action" data-edit="${item.id}">Editar</button>`:""}<button class="proposal-card-action" data-detail="${item.id}">🕘 Ver detalhes</button>${isManager()&&canCancel(item)?`<button class="proposal-card-action danger" data-cancel="${item.id}">Cancelar proposta</button>`:""}</div>`;
    return `<article class="proposal-item ${item.status}" data-detail="${item.id}" role="button" tabindex="0" aria-label="Ver detalhes de ${escapeHtml(item.title)}">
      <div class="proposal-item-top"><span class="proposal-status ${item.status}">${statusLabels[item.status]}</span><time>Atualizada em ${formatDate(item.updated_at)}</time></div>
      <div class="proposal-item-main"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.area||"Área não informada")}${item.segment?` · ${escapeHtml(item.segment)}`:""}</small>${mapped}${cancellation}</div>
      ${primary}
    </article>${tools}`;
  }).join(""):`<div class="proposal-empty"><strong>Nenhuma proposta encontrada</strong><span>${isManager()?"Ainda não há sugestões com estes filtros.":"Crie a primeira sugestão para iniciar a análise."}</span></div>`;
  document.querySelectorAll("[data-detail]").forEach(article=>{
    if(!article.classList.contains("proposal-item"))return;
    article.onclick=()=>openDetail(proposals.find(item=>item.id===article.dataset.detail));
    article.onkeydown=event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();article.onclick()}};
  });
  document.querySelectorAll("[data-edit]").forEach(button=>button.onclick=event=>{event.stopPropagation();openForm(proposals.find(item=>item.id===button.dataset.edit))});
  document.querySelectorAll("[data-review]").forEach(button=>button.onclick=event=>{event.stopPropagation();openReview(proposals.find(item=>item.id===button.dataset.review))});
  document.querySelectorAll("[data-cancel]").forEach(button=>button.onclick=event=>{event.stopPropagation();openCancel(proposals.find(item=>item.id===button.dataset.cancel))});
  document.querySelectorAll("[data-detail]").forEach(button=>{if(button.tagName==="BUTTON")button.onclick=event=>{event.stopPropagation();openDetail(proposals.find(item=>item.id===button.dataset.detail))}});
}

function openModal(id){$(id).classList.add("open");$(id).setAttribute("aria-hidden","false");document.body.classList.add("modal-open")}
function closeModal(id){$(id).classList.remove("open");$(id).setAttribute("aria-hidden","true");document.body.classList.remove("modal-open")}

function openForm(item=null){
  editingProposal=item;
  const form=$("proposal-form");
  form.reset();
  $("proposal-form-feedback").textContent="";
  document.querySelector('[name="mapped_areas"]')?.setCustomValidity("");
  $("proposal-modal-title").textContent=item?"Editar proposta":"Nova proposta de curso";
  $("proposal-catalog-hint").textContent=item?"A classificação pode ser ajustada pelos itens disponíveis no catálogo.":"Ao reconhecer um curso do catálogo, preenchemos a classificação automaticamente.";
  $("proposal-catalog-hint").className="catalog-hint";
  $("proposal-duplicate-warning").hidden=true;
  if(item){
    Object.entries(item).forEach(([key,value])=>{
      if(key==="mapped_areas"){setMappedAreas(value);return;}
      const input=form.elements[key];
      if(!input)return;
      if(["area","segment","course_type","level"].includes(key))ensureSelectValue(key,value);
      else input.value=Array.isArray(value)?value.join(", "):value??"";
    });
  }else{
    setMappedAreas([]);
  }
  renderProposalStep(1);
  openModal("proposal-modal");
}

function formPayload(status){
  const form=$("proposal-form");
  const data=new FormData(form);
  return {title:data.get("title").trim()||null,area:data.get("area").trim()||null,segment:data.get("segment").trim()||null,course_type:data.get("course_type").trim()||null,level:data.get("level").trim()||null,workload_hours:data.get("workload_hours")?Number(data.get("workload_hours")):null,target_audience:data.get("target_audience").trim()||null,justification:data.get("justification").trim()||null,demand_evidence:data.get("demand_evidence").trim()||null,interested_units:splitList(data.get("interested_units")),strategic_scenarios:splitList(data.get("strategic_scenarios")),mapped_areas:[...form.querySelectorAll('[name="mapped_areas"]:checked')].map(input=>input.value),related_technologies:data.get("related_technologies").trim()||null,status};
}

async function saveProposal(submit){
  const form=$("proposal-form");
  const feedback=$("proposal-form-feedback");
  if(submit){
    if(!validateFormForSubmit())return;
  }else{
    if(!validateStep(proposalStep))return;
  }
  const status=submit?"submetida":editingProposal?.status==="ajustes_solicitados"?"ajustes_solicitados":"rascunho";
  const payload=formPayload(status);
  feedback.textContent="Salvando...";
  let result;
  if(editingProposal)result=await window.supabaseClient.from("course_proposals").update(payload).eq("id",editingProposal.id).select().single();
  else result=await window.supabaseClient.from("course_proposals").insert({...payload,created_by:window.appSession.user.id}).select().single();
  if(result.error)throw result.error;
  closeModal("proposal-modal");
  toast(submit?"Proposta enviada para análise.":"Rascunho salvo.");
  await loadProposals();
}

function openCancel(item){
  cancellingProposal=item;
  $("proposal-cancel-title").textContent=item.title;
  $("proposal-cancel-subtitle").textContent=`${item.area||"Área não informada"} · ${statusLabels[item.status]} · criada em ${formatDate(item.created_at)}`;
  $("proposal-cancel-reason").value="";
  $("proposal-cancel-feedback").textContent="";
  openModal("proposal-cancel-modal");
}

function closeCancel(){
  if(!cancellingProposal)return;
  cancellingProposal=null;
  closeModal("proposal-cancel-modal");
}

async function saveCancel(){
  const reason=$("proposal-cancel-reason").value.trim();
  const feedback=$("proposal-cancel-feedback");
  if(!reason){feedback.textContent="Informe o motivo do cancelamento.";return;}
  if(!cancellingProposal)return;
  const button=$("proposal-cancel-submit");
  button.disabled=true;
  button.textContent="Cancelando...";
  try{
    const {error}=await window.supabaseClient.from("course_proposals").update({status:"cancelada",cancellation_reason:reason}).eq("id",cancellingProposal.id);
    if(error)throw error;
    closeCancel();
    toast("Proposta cancelada.");
    await loadProposals();
  }catch(error){
    feedback.textContent=error.message||"Não foi possível cancelar a proposta.";
  }finally{
    button.disabled=false;
    button.textContent="Confirmar cancelamento";
  }
}

function openReview(item){
  reviewingProposal=item;
  $("proposal-review-title").textContent=item.title;
  $("proposal-review-subtitle").textContent=`${item.area} · criada em ${formatDate(item.created_at)}`;
  $("proposal-review-status").value=managerStatuses.includes(item.status)?item.status:"em_analise";
  $("proposal-review-feedback").value=item.manager_feedback||"";
  $("proposal-review-feedback-message").textContent="";
  openModal("proposal-review-modal");
}

async function saveReview(){
  const feedback=$("proposal-review-feedback").value.trim();
  const status=$("proposal-review-status").value;
  const message=$("proposal-review-feedback-message");
  if(["ajustes_solicitados","reprovada"].includes(status)&&!feedback){
    message.textContent="Inclua um parecer para orientar a proposta.";
    return;
  }
  message.textContent="Salvando...";
  const {error}=await window.supabaseClient.from("course_proposals").update({status,manager_feedback:feedback||null}).eq("id",reviewingProposal.id);
  if(error)throw error;
  closeModal("proposal-review-modal");
  toast("Parecer atualizado.");
  await loadProposals();
}

async function loadProposalEvents(proposalId){
  try{
    return await remoteDb.proposalEvents(proposalId);
  }catch(e){
    console.error(e);
    return [];
  }
}

function formatEventAction(action,oldStatus,newStatus,details){
  const labels={criada:"Criada",status_alterado:"Status alterado",parecer_atualizado:"Parecer atualizado"};
  const statusLabel=statusLabels[newStatus]||newStatus;
  const oldLabel=statusLabels[oldStatus]||oldStatus;
  switch(action){
    case "criada":return`Proposta criada como <strong>${statusLabel}</strong>`;
    case "status_alterado":return`Status alterado de <strong>${oldLabel}</strong> para <strong>${statusLabel}</strong>${details?.manager_feedback?`: ${escapeHtml(details.manager_feedback)}`:""}${details?.cancellation_reason?` — ${escapeHtml(details.cancellation_reason)}`:""}`;
    case "parecer_atualizado":return`Parecer atualizado${details?.manager_feedback?`: ${escapeHtml(details.manager_feedback)}`:""}`;
    default:return action;
  }
}

async function openDetail(item){
  detailProposal=item;
  const events=await loadProposalEvents(item.id);
  $("proposal-detail-title").textContent=item.title;
  $("proposal-detail-subtitle").textContent=`${item.area} · ${item.segment||"Sem segmento"} · Atualizada em ${formatDate(item.updated_at)}`;
  const statusBadge=$("proposal-detail-status");
  statusBadge.textContent=statusLabels[item.status]||item.status;
  statusBadge.className=`proposal-status ${item.status}`;
  const listToTags=value=>value?.length?`<div class="detail-tags">${value.map(entry=>`<i>${escapeHtml(entry)}</i>`).join("")}</div>`:`<p class="detail-empty">Não informado</p>`;
  const mappedHtml=item.mapped_areas?.length?`<div class="wide"><strong>Áreas mapeadas</strong>${listToTags(item.mapped_areas)}</div>`:"";
  const cancelInfo=item.cancellation_reason?`<div class="detail-alert cancel"><strong>Motivo do cancelamento</strong><p>${escapeHtml(item.cancellation_reason)}</p></div>`:"";
  const feedbackInfo=item.manager_feedback?`<div class="detail-alert feedback"><strong>Parecer da gestão</strong><p>${escapeHtml(item.manager_feedback)}</p></div>`:"";
  const timelineHtml=events.length?events.map(e=>`<div class="timeline-item"><time>${formatDate(e.created_at)}</time><div>${formatEventAction(e.action,e.old_status,e.new_status,e.details)}</div></div>`).join(""):`<div class="timeline-empty">Sem histórico de alterações.</div>`;
  $("proposal-detail-body").innerHTML=`
    <section class="detail-section">
      <h3>Identificação</h3>
      <div class="detail-grid">
        <div><strong>Tipo de curso</strong><p>${escapeHtml(item.course_type||"Não informado")}</p></div>
        <div><strong>Nível</strong><p>${escapeHtml(item.level||"Não informado")}</p></div>
        <div><strong>Carga horária</strong><p>${item.workload_hours?`${item.workload_hours} h`:"Não informada"}</p></div>
        <div><strong>Área</strong><p>${escapeHtml(item.area||"Não informada")}</p></div>
        <div><strong>Segmento</strong><p>${escapeHtml(item.segment||"Não informado")}</p></div>
        <div><strong>Unidades interessadas</strong>${listToTags(item.interested_units)}</div>
        <div class="wide"><strong>Cenários estratégicos</strong>${listToTags(item.strategic_scenarios)}</div>
        ${mappedHtml}
      </div>
    </section>
    <section class="detail-section">
      <h3>Justificativa</h3>
      <div class="detail-grid">
        <div class="wide"><strong>Justificativa</strong><p>${escapeHtml(item.justification||"")}</p></div>
        <div><strong>Público-alvo</strong><p>${escapeHtml(item.target_audience||"Não informado")}</p></div>
        <div><strong>Evidências de demanda</strong><p>${escapeHtml(item.demand_evidence||"Não informado")}</p></div>
      </div>
    </section>
    <section class="detail-section">
      <h3>Complementos</h3>
      <div class="detail-grid">
        <div class="wide"><strong>Tecnologias relacionadas</strong><p>${escapeHtml(item.related_technologies||"Não informado")}</p></div>
      </div>
    </section>
    ${feedbackInfo}
    ${cancelInfo}
    <section class="detail-section">
      <h3>Histórico</h3>
      <div class="timeline">${timelineHtml}</div>
    </section>
  `;
  const actions=[];
  if(editable(item)){
    actions.push(`<button class="btn secondary" id="detail-edit">Editar</button>`);
  }
  if(isManager()&&item.status==="aprovada_para_catalogo"){
    actions.push(`<button class="btn primary" id="detail-export">Exportar para catálogo</button>`);
  }
  $("proposal-detail-actions").innerHTML=actions.join(" ");
  if($("detail-edit"))$("detail-edit").onclick=()=>{closeModal("proposal-detail-modal");openForm(item)};
  if($("detail-export"))$("detail-export").onclick=()=>exportProposal(item);
  openModal("proposal-detail-modal");
}

function exportProposal(item){
  const csvHeaders=["title","area","segment","course_type","level","workload_hours","target_audience","justification","demand_evidence","interested_units","strategic_scenarios","mapped_areas","related_technologies","status","Situação do Curso"];
  const row=csvHeaders.map(h=>h==="Situação do Curso"?"CURSO INÉDITO":`"${String(item[h]||"").replace(/"/g,'""')}"`).join(",");
  const csv="\uFEFF"+csvHeaders.join(",")+"\n"+row;
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=`proposta-${item.id.slice(0,8)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast("CSV exportado para inclusão no catálogo.");
}

async function loadProposals(){proposals=window.isPreviewMode?[]:await remoteDb.courseProposals();render()}

async function initialize(){
  try{
    await requireSupabaseSession();
    populateStatusOptions();
    populateCatalogOptions();
    if(window.isPreviewMode){$("new-proposal").disabled=true;toast("As propostas não são salvas no modo demonstração.")}
    await loadProposals();
  }catch(error){console.error(error);handleSupabaseError(error);}
}

$("new-proposal").onclick=()=>openForm();
$("proposal-close").onclick=()=>closeModal("proposal-modal");
$("proposal-review-close").onclick=()=>closeModal("proposal-review-modal");
$("proposal-detail-close").onclick=()=>closeModal("proposal-detail-modal");
$("proposal-cancel-close").onclick=closeCancel;
$("proposal-cancel-back").onclick=closeCancel;
$("proposal-cancel-form").onsubmit=event=>{event.preventDefault();saveCancel();};
$("proposal-modal").onclick=event=>{if(event.target===$("proposal-modal"))closeModal("proposal-modal")};
$("proposal-review-modal").onclick=event=>{if(event.target===$("proposal-review-modal"))closeModal("proposal-review-modal")};
$("proposal-detail-modal").onclick=event=>{if(event.target===$("proposal-detail-modal"))closeModal("proposal-detail-modal")};
$("proposal-cancel-modal").onclick=event=>{if(event.target===$("proposal-cancel-modal"))closeCancel()};
$("proposal-search").oninput=render;
$("proposal-status-filter").onchange=render;
$("proposal-form").elements.title.oninput=()=>{applyCatalogClassification();checkDuplicateProposal($("proposal-form").elements.title.value)};
$("proposal-form").elements.title.onblur=()=>checkDuplicateProposal($("proposal-form").elements.title.value);
$("proposal-form").elements.title.onchange=applyCatalogClassification;
document.querySelectorAll('[name="mapped_areas"]').forEach(input=>{input.onchange=()=>{renderMappedAreaChips([...document.querySelectorAll('[name="mapped_areas"]:checked')].map(i=>i.value));validateField(input)}});
$("proposal-save-draft").onclick=()=>saveProposal(false).catch(error=>{$("proposal-form-feedback").textContent=error.message||"Não foi possível salvar."});
$("proposal-submit").onclick=()=>saveProposal(true).catch(error=>{$("proposal-form-feedback").textContent=error.message||"Não foi possível enviar."});
$("proposal-form").onsubmit=event=>{event.preventDefault();saveProposal(true).catch(error=>{$("proposal-form-feedback").textContent=error.message||"Não foi possível enviar."})};
$("proposal-review-form").onsubmit=event=>{event.preventDefault();saveReview().catch(error=>{$("proposal-review-feedback-message").textContent=error.message||"Não foi possível salvar."})};
$("proposal-next").onclick=()=>{if(validateStep(proposalStep))renderProposalStep(proposalStep+1)};
$("proposal-prev").onclick=()=>renderProposalStep(proposalStep-1);
document.querySelectorAll(".proposal-wizard-step [required], .proposal-wizard-step [name='workload_hours'], .proposal-wizard-step [name='mapped_areas']").forEach(input=>{input.onblur=()=>validateField(input)});
document.addEventListener("keydown",event=>{if(event.key==="Escape"){closeModal("proposal-modal");closeModal("proposal-review-modal");closeModal("proposal-detail-modal");closeCancel()}});
initialize();