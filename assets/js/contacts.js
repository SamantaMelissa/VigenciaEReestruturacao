let contactQueue=[];
let activeContactId=null;
let savingContact=false;
const COURSES=window.COURSES_DATA||[];
const $=id=>document.getElementById(id);
const normalize=text=>(text||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const escapeHtml=text=>String(text??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const formatUnitCode=code=>{const digits=String(code??"").replace(/\D/g,"");return digits.length===3?`${digits[0]}.${digits.slice(1)}`:String(code??"")};
const validationUnit=item=>item.contacted_unit||((item.units||[])[0]?formatUnitCode(item.units[0]):"");
const statusLabel=status=>status==="em_contato"?"Em contato":status==="concluido"?"Concluído":"Pendente";
const contactCard=item=>`
  <article class="contact-item ${item.status}" data-contact-id="${item.id}">
    <span class="contact-item-icon">${item.status==="concluido"?"✓":"☎"}</span>
    <div class="contact-item-main"><small>Código ${escapeHtml(item.course_code)}</small><strong>${escapeHtml(item.course_name)}</strong><span>${escapeHtml(item.criterion_label)}</span></div>
    <div class="contact-item-meta"><span class="contact-units">Unidade: ${validationUnit(item)?escapeHtml(validationUnit(item)):"não informada"}</span><span class="contact-status ${item.status}">${statusLabel(item.status)}</span></div>
  </article>`;

function render(){
  const q=normalize($("contact-search").value),filter=$("contact-filter").value;
  const items=contactQueue.filter(item=>
    normalize(`${item.course_code} ${item.course_name} ${validationUnit(item)}`).includes(q)&&
    (filter==="todos"||item.status===filter)
  );
  const activeItems=items.filter(item=>item.status!=="concluido");
  const completedItems=items.filter(item=>item.status==="concluido");
  const count=status=>contactQueue.filter(item=>item.status===status).length;
  $("contact-open").textContent=count("pendente");$("contact-progress").textContent=count("em_contato");$("contact-done").textContent=count("concluido");
  $("completed-visible-count").textContent=completedItems.length.toLocaleString("pt-BR");
  $("contact-list").innerHTML=activeItems.length?activeItems.map(contactCard).join(""):`<div class="contact-empty"><strong>Nenhuma validação em aberto</strong><br>Não há cursos que precisem de ação com os filtros atuais.</div>`;
  $("completed-contact-list").innerHTML=completedItems.length?completedItems.map(contactCard).join(""):`<div class="contact-empty"><strong>Nenhuma validação concluída encontrada</strong><br>Os retornos finalizados aparecerão nesta área.</div>`;
  document.querySelectorAll("[data-contact-id]").forEach(card=>card.onclick=()=>openContact(card.dataset.contactId));
}

function openContact(id){
  const item=contactQueue.find(entry=>String(entry.id)===String(id));if(!item)return;
  activeContactId=item.id;$("contact-modal-title").textContent=item.course_name;
  $("contact-modal-code").textContent=`Código ${item.course_code} · Criado em ${new Date(item.created_at).toLocaleString("pt-BR")}`;
  const enrollmentRows=Object.entries(item.enrollments||{}).map(([year,value])=>`${year}: ${Number(value).toLocaleString("pt-BR")}`).join(" · ");
  $("contact-evidence").innerHTML=`
    <div class="dossier-block"><span>Motivo da validação</span><strong>${escapeHtml(item.reason_question)}</strong></div>
    <div class="dossier-block"><span>Unidade</span><strong>${validationUnit(item)?escapeHtml(validationUnit(item)):"Não informada"}</strong></div>
    <div class="dossier-block"><span>Matrículas evidenciadas</span><p>${escapeHtml(enrollmentRows)}</p></div>
    <div class="dossier-block"><span>Critério aplicado</span><p>${escapeHtml(item.criterion_label)}</p></div>
    <div class="dossier-block"><span>Caminho percorrido</span><div class="dossier-trail">${(item.decision_trail||[]).map(a=>`<i>P${a.step}: ${a.answer?"SIM":"NÃO"}</i>`).join("")||"<i>Início do fluxo</i>"}</div></div>`;
  $("contact-status").value=item.status||"pendente";$("contact-owner").value=item.responsible_name||"";
  $("contact-unit").value=validationUnit(item);
  $("contact-date").value=item.contact_date||"";$("contact-notes").value=item.notes||"";
  $("contact-answer").value=item.school_answer===true?"sim":item.school_answer===false?"nao":"";
  updateAnswerStatus();$("contact-modal").classList.add("open");$("contact-modal").setAttribute("aria-hidden","false");
}

function closeContact(){$("contact-modal").classList.remove("open");$("contact-modal").setAttribute("aria-hidden","true");activeContactId=null}
function formPayload(){
  const answer=$("contact-answer").value;
  return {
    status:$("contact-status").value,responsible_name:$("contact-owner").value.trim(),
    responsible_user_id:appSession.user.id,contacted_unit:$("contact-unit").value.trim(),
    contact_date:$("contact-date").value||null,notes:$("contact-notes").value.trim()||null,
    school_answer:answer==="sim"?true:answer==="nao"?false:null,
    concluded_at:answer?new Date().toISOString():null
  };
}
async function saveContact(){
  if(!activeContactId||savingContact)return;
  const item=contactQueue.find(entry=>entry.id===activeContactId);if(!item)return;
  const button=$("contact-save"),label=button.textContent;
  savingContact=true;button.disabled=true;button.textContent="Salvando...";
  try{
    const {data,error}=await supabaseClient.from("school_validations").update(formPayload()).eq("id",activeContactId).select().single();
    if(error){if(!handleSupabaseError(error))toast("Não foi possível salvar o acompanhamento.");return}
    if(typeof data.school_answer==="boolean"){
      const trail=[...(item.decision_trail||[]).filter(entry=>entry.step!==5),{step:5,answer:data.school_answer,text:item.reason_question}];
      const {error:evaluationError}=await supabaseClient.rpc("apply_school_validation_return",{p_validation_id:item.id,p_positive:data.school_answer,p_trail:trail});
      if(evaluationError){if(!handleSupabaseError(evaluationError))toast("Contato salvo, mas não foi possível encaminhar a avaliação.");return}
    }
    contactQueue=contactQueue.map(entry=>entry.id===data.id?data:entry);render();closeContact();
    toast(data.school_answer===true?"Retorno positivo salvo. A análise está disponível para a equipe.":data.school_answer===false?"Retorno salvo e avaliação concluída como fechamento de vigência.":"Acompanhamento salvo no banco compartilhado.");
  }finally{
    savingContact=false;button.disabled=false;button.textContent=label;
  }
}
function updateAnswerStatus(){
  const answered=["sim","nao"].includes($("contact-answer").value);
  if(answered)$("contact-status").value="concluido";
}
async function deleteContact(){
  if(!activeContactId)return;
  const {error}=await supabaseClient.from("school_validations").delete().eq("id",activeContactId);
  if(error){if(!handleSupabaseError(error))toast("Somente administradores podem excluir uma pendência.");return}
  contactQueue=contactQueue.filter(item=>item.id!==activeContactId);render();closeContact();toast("Pendência removida.");
}
function toast(text){$("toast").textContent=text;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2500)}

$("contact-search").oninput=render;$("contact-filter").onchange=()=>{$("completed-validations").open=$("contact-filter").value==="concluido";render()};$("contact-modal-close").onclick=closeContact;
$("contact-save").onclick=saveContact;$("contact-delete").onclick=deleteContact;$("contact-modal").onclick=event=>{if(event.target===$("contact-modal"))closeContact()};
$("contact-answer").onchange=updateAnswerStatus;

async function initializeContacts(){
  try{
    await requireSupabaseSession();
    if(isPreviewMode){location.replace("index.html");return}
    contactQueue=await remoteDb.validations();
    render();
  }catch(error){handleSupabaseError(error);showSystemUnavailable()}
}
initializeContacts();
