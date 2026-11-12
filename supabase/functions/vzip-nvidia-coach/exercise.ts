export const families = ['wob','phr','into','vib','rhythm','diction','expression','interpretation'];
export function parseExercise(raw: string, excluded: string[], rest: boolean) {
 if(rest)return {family:'interpretation',name:'소리 없는 가사 정리',reason:'기록한 목 불편함을 먼저 반영했어요.',steps:['오늘은 소리 내는 연습을 쉬어요.','가사 한 구절에서 전하고 싶은 뜻을 메모해요.'],goal:'불편함을 기록하고 쉬기',minutes:3};
 const x=JSON.parse(raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
 if(!families.includes(x.family)||excluded.includes(x.family))throw Error('duplicate exercise');
 for(const k of ['name','reason','goal'])if(typeof x[k]!=='string'||!x[k].trim()||x[k].length>250)throw Error('invalid exercise');
 if(!Array.isArray(x.steps)||x.steps.length<2||x.steps.length>4||x.steps.some((s: unknown)=>typeof s!=='string'||!s.trim()||s.length>250))throw Error('invalid steps');
 const content=x.name+' '+x.steps.join(' ');
 if(excluded.some(k=>k==='wob'||k==='maintain')&&/롱톤|지속음/.test(content)||excluded.includes('phr')&&/호흡|프레이즈|숨\s*쉬|내쉬/.test(content))throw Error('duplicate exercise');
 const minutes=Number(x.minutes);if(!Number.isInteger(minutes)||minutes<1||minutes>10)throw Error('invalid minutes');
 return {family:x.family,name:x.name.trim(),reason:x.reason.trim(),steps:x.steps,goal:x.goal.trim(),minutes};
}
