let contactQueue=[];
let activeContactId=null;
const COURSES=window.COURSES_DATA||[];
const $=id=>document.getElementById(id);
const normalize=text=>(text||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const escapeHtml=text=>String(text??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const formatUnitCode=code=>{const digits=String(code??"").replace(/\D/g,"");return digits.length===3?`${digits[0]}.${digits.slice(1)}`:String(code??"")};
const statusLabel=status=>status==="em_contato"?"Em contato":status==="concluido"?"Concluído":"Pendente";

function render(){
  const q=normalize($("contact-search").value),filter=$("contact-filter").value;
  const items=contactQueue.filter(item=>
    normalize(`${item.course_code} ${item.course_name} ${(item.units||[]).join(" ")}`).includes(q)&&
    (filter==="todos"||item.status===filter)
  );
  const count=status=>contactQueue.filter(item=>item.status===status).length;
  $("contact-open").textContent=count("pendente");$("contact-progress").textContent=count("em_contato");$("contact-done").textContent=count("concluido");
  $("contact-list").innerHTML=items.length?items.map(item=>`
    <article class="contact-item" data-contact-id="${item.id}">
      <span class="contact-item-icon">☎</span>
      <div><strong>${escapeHtml(item.course_name)}</strong><small>Código ${item.course_code} · ${escapeHtml(item.criterion_label)}</small></div>
      <span class="contact-units">Unidades: ${(item.units||[]).length?item.units.map(formatUnitCode).map(escapeHtml).join(", "):"não identificadas"}</span>
      <span class="contact-status ${item.status}">${statusLabel(item.status)}</span>
    </article>`).join(""):`<div class="contact-empty"><strong>Nenhuma pendência encontrada</strong><br>Os cursos que exigirem contato com uma unidade aparecerão aqui automaticamente.</div>`;
  document.querySelectorAll("[data-contact-id]").forEach(card=>card.onclick=()=>openContact(card.dataset.contactId));
}

function openContact(id){
  const item=contactQueue.find(entry=>String(entry.id)===String(id));if(!item)return;
  activeContactId=item.id;$("contact-modal-title").textContent=item.course_name;
  $("contact-modal-code").textContent=`Código ${item.course_code} · Criado em ${new Date(item.created_at).toLocaleString("pt-BR")}`;
  const enrollmentRows=Object.entries(item.enrollments||{}).map(([year,value])=>`${year}: ${Number(value).toLocaleString("pt-BR")}`).join(" · ");
  $("contact-evidence").innerHTML=`
    <div class="dossier-block"><span>Motivo da validação</span><strong>${escapeHtml(item.reason_question)}</strong></div>
    <div class="dossier-block"><span>Unidades identificadas</span><strong>${(item.units||[]).length?item.units.map(formatUnitCode).map(escapeHtml).join(", "):"Nenhuma unidade localizada"}</strong></div>
    <div class="dossier-block"><span>Matrículas evidenciadas</span><p>${escapeHtml(enrollmentRows)}</p></div>
    <div class="dossier-block"><span>Critério aplicado</span><p>${escapeHtml(item.criterion_label)}</p></div>
    <div class="dossier-block"><span>Caminho percorrido</span><div class="dossier-trail">${(item.decision_trail||[]).map(a=>`<i>P${a.step}: ${a.answer?"SIM":"NÃO"}</i>`).join("")||"<i>Início do fluxo</i>"}</div></div>`;
  $("contact-status").value=item.status||"pendente";$("contact-owner").value=item.responsible_name||"";
  $("contact-unit").value=item.contacted_unit||((item.units||[])[0]?formatUnitCode(item.units[0]):"");
  $("contact-date").value=item.contact_date||"";$("contact-notes").value=item.notes||"";
  $("contact-answer").value=item.school_answer===true?"sim":item.school_answer===false?"nao":"";
  updateReturnButton();$("contact-modal").classList.add("open");$("contact-modal").setAttribute("aria-hidden","false");
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
  if(!activeContactId)return;
  const {data,error}=await supabaseClient.from("school_validations").update(formPayload()).eq("id",activeContactId).select().single();
  if(error){if(!handleSupabaseError(error))toast("Não foi possível salvar o acompanhamento.");return}
  contactQueue=contactQueue.map(item=>item.id===data.id?data:item);render();closeContact();toast("Acompanhamento salvo no banco compartilhado.");
}
function updateReturnButton(){
  const answered=["sim","nao"].includes($("contact-answer").value);
  if(answered)$("contact-status").value="concluido";
  $("contact-return").disabled=!answered;
}
async function saveAndReturn(){
  const item=contactQueue.find(entry=>entry.id===activeContactId);if(!item)return;
  const answer=$("contact-answer").value;if(!["sim","nao"].includes(answer))return;
  const positive=answer==="sim",contactPayload={...formPayload(),status:"concluido"};
  const {error:contactError}=await supabaseClient.from("school_validations").update(contactPayload).eq("id",item.id);
  if(contactError){if(!handleSupabaseError(contactError))toast("Não foi possível concluir o contato.");return}
  const next=item.criterion_key==="fic"?(positive?6:"FECHAR A VIGÊNCIA"):(positive?7:6);
  const trail=[...(item.decision_trail||[]).filter(entry=>entry.step!==5),{step:5,answer:positive,text:item.reason_question}];
  const course=COURSES.find(entry=>entry.code===item.course_code);
  const evaluationPayload={
    course_code:item.course_code,course_name:item.course_name,criterion_key:item.criterion_key,
    criterion_label:item.criterion_label,status:"rascunho",current_question:typeof next==="number"?next:5,
    final_result:typeof next==="string"?next:null,created_by:appSession.user.id,
    state:{answers:trail,enrollments:item.enrollments||{},units:item.units||[],returnedFromContact:true}
  };
  const {data:existing}=await supabaseClient.from("evaluations").select("id")
    .eq("course_code",item.course_code).eq("created_by",appSession.user.id).in("status",["rascunho","em_analise"]).maybeSingle();
  const operation=existing
    ?supabaseClient.from("evaluations").update(evaluationPayload).eq("id",existing.id)
    :supabaseClient.from("evaluations").insert(evaluationPayload);
  const {error:evaluationError}=await operation;
  if(evaluationError){if(!handleSupabaseError(evaluationError))toast("Contato salvo, mas não foi possível preparar o retorno.");return}
  location.href=`index.html?retomar=${encodeURIComponent(item.course_code)}`;
}
async function deleteContact(){
  if(!activeContactId)return;
  const {error}=await supabaseClient.from("school_validations").delete().eq("id",activeContactId);
  if(error){if(!handleSupabaseError(error))toast("Somente administradores podem excluir uma pendência.");return}
  contactQueue=contactQueue.filter(item=>item.id!==activeContactId);render();closeContact();toast("Pendência removida.");
}
function toast(text){$("toast").textContent=text;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2500)}

$("contact-search").oninput=render;$("contact-filter").onchange=render;$("contact-modal-close").onclick=closeContact;
$("contact-save").onclick=saveContact;$("contact-delete").onclick=deleteContact;$("contact-modal").onclick=event=>{if(event.target===$("contact-modal"))closeContact()};
$("contact-answer").onchange=updateReturnButton;$("contact-return").onclick=saveAndReturn;

async function initializeContacts(){
  try{
    await requireSupabaseSession();
    if(isPreviewMode){location.replace("index.html");return}
    contactQueue=await remoteDb.validations();
    render();
  }catch(error){handleSupabaseError(error);showSystemUnavailable()}
}
initializeContacts();
