from pathlib import Path
import re,json,base64,shutil
root=Path(__file__).parent
src=root/'source'
if not src.exists():shutil.copytree(root.parent/'source-inspect',src,ignore=shutil.ignore_patterns('tests'))
approved=(root.parent/'Vocalzip_Floating_Record_Home.html').read_text() if (root.parent/'Vocalzip_Floating_Record_Home.html').exists() else (root/'approved-home.html').read_text()
(root/'approved-home.html').write_text(approved)
home=re.search(r'<main>([\s\S]*?)</main>',approved).group(1)
home_styles='\n'.join(re.findall(r'<style>([\s\S]*?)</style>',approved))
home_styles=re.sub(r'@import\s+url\([^;]+;','',home_styles)
# Original home global body styles are neutralized; existing subpage style is not replaced.
home_styles=re.sub(r'(?m)^html\{[^}]*\}|^body\{[^}]*\}','',home_styles)
font_css=[]
for cssfile,fontfile in [('style.css','Phosphor.woff2'),('fill.css','Phosphor-Fill.woff2')]:
 css=(src/'vendor/phosphor'/cssfile).read_text();font=re.sub(r'\s','',(src/'vendor/phosphor'/(fontfile+'.b64')).read_text());css=css.replace('./'+fontfile,'data:font/woff2;base64,'+font);font_css.append(css)
scripts=['media-date.js','app/repertoire-model.js','app/core.js','app/picker.js','app/metric-help.js','app/media.js','data-merge.js','app/student-home-model.js','@adapter','app/views-main.js','app/calendar-summary.js','app/views-lessons.js','app/billing-lessons.js','app/views-more.js','app/import-hub.js','app/storage.js','app/upload-check.js','app/song-suggestions.js','app/analysis.js','app/song-vocal-growth.js','app/scores.js','app/practice-tips.js','app/auto-analysis.js','app/server-analysis.js','app/library-select.js','app/repertoire.js','app/performance-assets.js','app/media-follow.js']
def script(s):return '<script>'+s.replace('</script','<\\/script')+'</script>\n'
original_css='\n'.join((src/p).read_text() for p in ['app/app.css','app/calendar-summary.css','app/repertoire.css'])
out='''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#F8F6FD"><title>Vocalzip · 현재 개발본 기반 시안</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"><style>'''+''.join(font_css)+original_css+home_styles+'''</style><style id="current-theme">'''+(root/'current-theme.css').read_text()+'''</style></head><body>
<div class="v-app"><header id="top" class="v-top"></header><main id="view" tabindex="-1"></main></div>
<nav class="v-nav" aria-label="주요 메뉴"><ul>'''+''.join('<li><a href="#/'+key+'" data-nav="'+key+'"><i class="ph ph-'+icon+'"></i><span>'+label+'</span></a></li>' for key,icon,label in [('home','house','홈'),('songs','music-notes','내 곡'),('library','archive-box','보관함'),('calendar','calendar-blank','일정')])+'''</ul></nav>
<a id="preview-fab" class="preview-fab" href="#/record" aria-label="녹음 시작"><i class="ph ph-microphone"></i><span>녹음 시작</span></a>
<div id="vzip-park" hidden></div>
'''
out+=script((root/'preview-environment.js').read_text())
out+=script("if(new URLSearchParams(location.search).get('look')==='original')document.getElementById('current-theme').disabled=true;")
for name in scripts:
 text=(root/'source-adapter.js').read_text() if name=='@adapter' else (src/name).read_text()
 text=re.sub(r"VZ\.anonKey\s*=\s*'[^']+';","VZ.anonKey = ''; // External calls are disabled in this design preview.",text)
 out+=script(text)
out+=script('window.__APPROVED_HOME_CONTENT__='+json.dumps(home,ensure_ascii=False)+';')+script((root/'preview-boot.js').read_text())
out+='<!--\n'+(root/'THIRD_PARTY_NOTICES.md').read_text()+'\n--></body></html>'
(root/'Vocalzip_Current_UI.html').write_text(out)
inventory={}
for name in scripts:
 if name!='@adapter':
  text=(src/name).read_text();names=re.findall(r"\b(?:VZ|V)\.route\('([^']+)'",text)
  if names:inventory[name]=names
(root/'route-inventory.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2))
print('Built',len(out.encode()),'bytes;',sum(map(len,inventory.values())),'registered source routes')
