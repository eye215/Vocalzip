// Request only an existing cloud source; no audio leaves the device through this endpoint.
(()=>{
'use strict';
const V=window.VZ,S=window.VzipVoicePathSeparation;if(!V||!S)return;
V.voicePathServerAvailable=item=>!!item?.cloud&&!!S.source(item)&&!!window.vzipCloudSignedIn?.()&&typeof window.vzipCloudAccessToken==='function';
V.voicePathServerRequest=async(item,{signal,retry=false}={})=>{
 if(!V.voicePathServerAvailable(item))return null;
 const owner=window.vzipCloudUserId?.(),session=window.vzipCloudSessionId?.();if(!owner||!session)throw Error('로그인을 확인해 주세요.');const token=await window.vzipCloudAccessToken();if(!token)throw Error('로그인을 확인해 주세요.');
 const response=await fetch('https://chxnbtiyuyhiywzeshis.supabase.co/functions/v1/vzip-voice-path',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({mediaId:item.id,source:S.source(item),retry}),signal,cache:'no-store'});
 let data={};try{data=await response.json();}catch{}
 if(owner!==window.vzipCloudUserId?.()||session!==window.vzipCloudSessionId?.())throw Error('계정이 변경되어 요청을 중단했어요.');
 if(!response.ok)throw Error(data.error||'서버 분리를 요청하지 못했어요.');if(!['queued','running','done','failed','withheld'].includes(data.state))throw Error('서버 분리 상태를 확인하지 못했어요.');return data;
};
})();
