from pathlib import Path
import json,re,subprocess

root=Path(__file__).parent
source=root/'approved-home.html'
if not source.exists():
 source.write_text((root.parent/'Vocalzip_Floating_Record_Home.html').read_text())
home=source.read_text()
main=re.search(r'<main>([\s\S]*?)</main>',home).group(1)
styles='\n'.join(re.findall(r'<style>([\s\S]*?)</style>',home)).replace('#vocalzip-refined-preview','#vocalzip-prototype')
for selector in ['button{font:inherit','svg{width:20px','h2{font-size:18px']:
 styles=styles.replace('#vocalzip-prototype '+selector,':where(#vocalzip-prototype) '+selector)
styles=re.sub(r'@import\s+url\([^;]+;','',styles)
names=['AudioLines','Bell','UserRound','ChevronLeft','ChevronRight','Plus','Search','Inbox','Music2','History','Upload','Video','Play','NotebookPen','ListChecks','Mic','Wind','ChartNoAxesColumnIncreasing','Palette','Circle','Drama','Pencil','Check','Pause','Square','RotateCcw','House','Archive','CalendarDays']
js="const l=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/lucide');const names="+json.dumps(names)+";console.log(JSON.stringify(Object.fromEntries(names.map(n=>{if(!l[n])throw Error(n);return [n,l[n].map(([t,a])=>'<'+t+' '+Object.entries(a).map(([k,v])=>k+'=\\\"'+String(v).replaceAll('&','&amp;').replaceAll('\\\"','&quot;')+'\\\"').join(' ')+'/>').join('')]}))))"
icons=json.loads(subprocess.check_output(['node','-e',js],text=True))
# The generated markup comes only from the packaged Lucide icon library.
icons={k:v.replace('\\"','"') for k,v in icons.items()}
def icon(name):return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[name]+'</svg>'
nav=''.join('<a class="vz-nav-item" data-nav="'+key+'" href="#/'+key+'">'+icon(n)+'<span>'+label+'</span></a>' for key,n,label in [('home','House','홈'),('songs','Music2','내 곡'),('library','Archive','보관함'),('calendar','CalendarDays','일정')])
html='''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#F8F6FD"><title>Vocalzip · 디자인 시스템과 서브페이지</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css">
<style>'''+styles+'\n'+(root/'design-tokens.css').read_text()+'\n'+(root/'subpages.css').read_text()+'''</style></head><body>
<div id="vocalzip-prototype"><div class="vz-phone"><header id="app-header"></header><main id="app-main"></main>
<button type="button" id="record-fab" class="vz-floating-record" aria-label="녹음 시작">'''+icon('Mic')+'''<span>녹음 시작</span></button>
<div id="app-nav-space" class="vz-nav-space"><nav id="app-nav" class="vz-nav" aria-label="하단 메뉴">'''+nav+'''</nav></div></div></div>
<dialog id="app-dialog" aria-labelledby="sheet-title"><div class="sheet-head"><h2 id="sheet-title"></h2><button type="button" class="icon-btn" data-action="close-sheet" aria-label="닫기">'''+icon('Plus').replace('<svg ','<svg style="transform:rotate(45deg)" ')+'''</button></div><form id="sheet-form"><div id="sheet-body"></div><div id="sheet-actions" class="sheet-actions"></div></form></dialog>
<div id="toast" role="status" aria-live="polite" hidden></div>
<noscript><div style="padding:24px;text-align:center">페이지 이동에는 JavaScript가 필요해요. 별도 제공된 홈 HTML은 스크립트 없이도 열 수 있어요.</div></noscript>
<script>window.VZ_ICONS='''+json.dumps(icons,ensure_ascii=False)+''';window.VZ_HOME_HTML='''+json.dumps(main,ensure_ascii=False)+''';</script><script>'''+(root/'app.js').read_text()+'''</script></body></html>'''
license_path=Path('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/lucide/LICENSE')
if license_path.exists():html=html.replace('</html>','<!--\nLucide icon license\n'+license_path.read_text()+'\n-->\n</html>')
(root/'Vocalzip_UI_Kit.html').write_text(html)
print('Built',root/'Vocalzip_UI_Kit.html',len(html.encode()),'bytes')
