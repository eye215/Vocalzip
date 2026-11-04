(()=>{'use strict';
const S=window.VzipBillingStore,B=window.VzipBillingBackup,Cloud=window.VzipBillingCloud,$=id=>document.getElementById(id);
let plan=null,busy=false;
const say=(message,error=false)=>{$('transfer-status').textContent=message;$('transfer-status').className=error?'error':''};
const money=n=>new Intl.NumberFormat('ko-KR').format(n)+'원';
function describe(summary){return summary?'레슨권 '+summary.passes+'개 · 결제 '+summary.payments+'건 · 수강 '+summary.deductions+'건\n잔여 '+summary.remainingUnits/100+'회 · 순결제 '+money(summary.netPaid)+' · 미납 '+money(summary.unpaid):'저장된 정산 없음'}
async function refresh(message){
 const info=await S.status();$('recovery-status').textContent=info.recovery?info.recovery.at+' · '+describe(info.recovery.summary):'교체 전 기록이 아직 없어요.';
 for(const id of ['recovery-preview','recovery-export'])$(id).disabled=!info.recovery||busy;
 if(message)say(message);else say((S.account.id==='device'?'기기 전용 · 클라우드는 로그인 후 사용':'클라우드 기준 버전 '+info.meta.remoteRevision+' · '+(info.meta.syncedLocalRevision===info.state.revision?'마지막 전송 이후 기기 변경 없음':'아직 전송하지 않은 기기 변경 있음'))+' · 클라우드 최신 상태는 미리보기에서 확인합니다.');
}
function clear(){plan=null;$('transfer-preview').hidden=true;$('transfer-confirm').checked=false;$('transfer-owner').checked=false;$('transfer-commit').disabled=true}
function show(next){
 plan=next;$('transfer-title').textContent=next.direction==='upload'?'클라우드 저장':next.direction==='download'?'클라우드 가져오기':next.undo?'교체 전 기록 되돌리기':'JSON 백업 복원';
 $('transfer-comparison').textContent='현재 대상\n'+describe(next.before)+'\n\n적용 후\n'+describe(next.after)+(next.identical?'\n클라우드 내용이 이미 같아요. 연결 상태만 갱신합니다.':'');
 $('transfer-owner-label').hidden=next.payload.owner===S.account.id;$('transfer-confirm').checked=false;$('transfer-owner').checked=false;$('transfer-commit').disabled=true;$('transfer-preview').hidden=false;
}
function enableCommit(){$('transfer-commit').disabled=busy||!plan||!$('transfer-confirm').checked||(!$('transfer-owner-label').hidden&&!$('transfer-owner').checked)}
async function run(fn){
 if(busy)return;busy=true;const controls=[...$('transfer').querySelectorAll('button,input')].map(node=>[node,node.disabled]);controls.forEach(([node])=>node.disabled=true);
 try{await fn()}catch(error){say(error.message,true)}finally{controls.forEach(([node,disabled])=>node.disabled=disabled);busy=false;try{const info=await S.status();for(const id of ['recovery-preview','recovery-export'])$(id).disabled=!info.recovery}catch{}enableCommit()}
}
async function exportJSON(data,prefix='vocalzip-billing'){
 if(!data)throw Error('다운로드할 기록이 없어요.');S.ensureAccount();const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');
 a.href=url;a.download=prefix+'-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
$('export').onclick=()=>run(async()=>{await exportJSON(await S.load());say('정산 JSON 백업을 다운로드했어요.')});
$('restore-preview').onclick=()=>run(async()=>{
 clear();const file=$('restore-file').files?.[0];if(!file)throw Error('JSON 백업 파일을 선택해 주세요.');if(file.size>B.LIMIT)throw Error('백업 파일은 8MB 이하만 읽을 수 있어요.');
 const payload=B.parse(await file.text()),current=await S.load();show({direction:'restore',payload,localRevision:current.revision,before:B.summary(current),after:B.summary(payload)});say('백업 파일 검증 완료. 아직 기록을 변경하지 않았어요.');
});
$('restore-file').onchange=clear;
for(const direction of ['upload','download'])$('cloud-preview-'+direction).onclick=()=>run(async()=>{clear();show(await Cloud.preview(direction));say('클라우드 미리보기를 준비했어요. 아직 기록을 변경하지 않았어요.')});
$('recovery-preview').onclick=()=>run(async()=>{
 clear();const payload=await S.recoveryData();if(!payload)throw Error('되돌릴 기록이 없어요.');const current=await S.load();
 show({direction:'restore',undo:true,payload:B.validate(payload),localRevision:current.revision,before:B.summary(current),after:B.summary(payload)});
});
$('recovery-export').onclick=()=>run(async()=>{await exportJSON(await S.recoveryData(),'vocalzip-billing-before-replace');say('교체 전 기록을 다운로드했어요.')});
$('transfer-commit').onclick=()=>run(async()=>{
 if(!plan||!$('transfer-confirm').checked||(!$('transfer-owner-label').hidden&&!$('transfer-owner').checked))return;
 const currentPlan=plan;
 if(plan.direction==='restore')await S.replace(plan.payload,plan.localRevision,{allowOwnerChange:$('transfer-owner').checked,undo:!!plan.undo,reason:plan.undo?'recovery.restore':'backup.restore'});
 else await Cloud.commit(plan);
 clear();window.dispatchEvent(new Event(currentPlan.direction==='upload'?'billing:changed':'billing:replaced'));await refresh(currentPlan.direction==='upload'?'클라우드 저장 확인 완료.':'정산 기록을 교체했어요. 교체 전 기록은 아래에서 되돌릴 수 있어요.');
});
$('transfer-cancel').onclick=()=>{clear();say('취소했어요. 정산 기록은 변경하지 않았어요.')};
$('transfer-confirm').onchange=$('transfer-owner').onchange=enableCommit;
window.addEventListener('billing:changed',()=>{refresh().catch(error=>say(error.message,true))});
window.addEventListener('billing:account-changed',()=>{clear();say('로그인 계정이 변경됐어요. 새로고침해 주세요.',true)});
refresh().catch(error=>say(error.message,true));
})();
