// Shared-token integration: fixtures only; never contacts live accounts or services.
const {test,expect}=require('@playwright/test');
test.beforeEach(async({page})=>{
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
});
async function mount(page,body,styles=['design-system/tokens.css','app/app.css','design-system/global-app.css']){
  await page.route('**/__token_test',route=>route.fulfill({contentType:'text/html',body:
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">'+
    styles.map(p=>'<link rel="stylesheet" href="/'+p+'">').join('')+body}),{times:1});
  await page.goto('/__token_test');
}
const regular='<body><div class="v-app"><header class="v-top"><h1>내 곡</h1></header><main><h2 class="sec">전체 곡</h2><div class="card">카드</div><button class="btn">저장</button></main></div><nav class="v-nav"><ul><li><a aria-current="page">홈</a></li><li><a>내 곡</a></li><li><a>보관함</a></li><li><a>일정</a></li></ul></nav><a class="vz-collection-record">녹음</a></body>';
test('legacy entry points import the latest shared values',async({page})=>{
  for(const entry of ['design-system/tokens.css','design-system/student-home-tokens.css','design-handoff-20261108-lavender-home/design-tokens.css']){
    await mount(page,'<body><div id="p" style="padding:var(--vz-padding-card);margin:var(--vz-page-inset);color:var(--vz-song-title)"></div></body>',[entry]);
    await expect(page.locator('#p')).toHaveCSS('padding','16px');
    await expect(page.locator('#p')).toHaveCSS('margin','12px');
    await expect(page.locator('#p')).toHaveCSS('color','rgb(16, 24, 40)');
  }
});
test('all responsive widths keep the shared shell and type scale',async({page})=>{
  for(const width of [320,390,430,1280]){
    await page.setViewportSize({width,height:844});await mount(page,regular);
    await expect(page.locator('h1')).toHaveCSS('font-size','26px');
    await expect(page.locator('h1')).toHaveCSS('line-height','34px');
    await expect(page.locator('h2')).toHaveCSS('font-size','18px');
    await expect(page.locator('.card')).toHaveCSS('padding','16px');
    await expect(page.locator('.card')).toHaveCSS('border-radius','20px');
    await expect(page.locator('.v-app')).toHaveCSS('padding-left','12px');
    await expect(page.locator('.v-nav')).toHaveCSS('height','70px');
    await expect(page.locator('.v-nav')).toHaveCSS('background-color','rgba(255, 255, 255, 0.58)');
    await expect(page.locator('.v-nav a').first()).toHaveCSS('background-color','rgb(237, 225, 255)');
    await expect(page.locator('.vz-collection-record')).toHaveCSS('width','56px');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});
test('changing semantic colours updates live aliases and components',async({page})=>{
  await mount(page,regular);
  await page.evaluate(()=>document.body.style.setProperty('--vz-color-accent','#123456'));
  await expect(page.locator('.btn')).toHaveCSS('background-color','rgb(18, 52, 86)');
  await page.evaluate(()=>document.body.style.setProperty('--vz-color-canvas','#f0f1f2'));
  await expect(page.locator('body')).toHaveCSS('background-color','rgb(240, 241, 242)');
});
test('teacher scope rebinds inherited aliases without changing student siblings',async({page})=>{
  await mount(page,'<body><div id="student" style="color:var(--accent)"></div><section data-vz-theme="teacher"><div id="teacher" style="color:var(--accent);background:var(--surface-2)"></div></section></body>',['design-system/tokens.css']);
  await expect(page.locator('#teacher')).toHaveCSS('color','rgb(56, 108, 203)');
  await expect(page.locator('#teacher')).toHaveCSS('background-color','rgb(228, 238, 255)');
  await expect(page.locator('#student')).toHaveCSS('color','rgb(122, 50, 245)');
});
test('recording retains its dark palette after the shared shell loads',async({page})=>{
  await mount(page,'<body class="vz-record-mode"><div class="v-app"><header class="v-top"><h1>녹음</h1></header><div class="card">어두운 카드</div></div></body>',['design-system/tokens.css','app/app.css','design-system/global-app.css','app/record-experience.css']);
  await expect(page.locator('h1')).toHaveCSS('color','rgb(247, 245, 252)');
  await expect(page.locator('.card')).toHaveCSS('background-color','rgb(27, 23, 36)');
  expect(await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--surface-2').trim())).toBe('#292038');
});
test('forms, disabled save, focus and short menus use shared state tokens',async({page})=>{
  await mount(page,'<body><div class="sheet-back sheet-page"><section class="sheet sheet-form-page"><div class="sheet-body"><label class="field"><input placeholder="곡명"></label></div><footer class="sheet-foot"><button disabled>저장</button></footer></section></div></body>');
  // Real forms place sheet-form-page on the backdrop.
  await page.locator('.sheet-back').evaluate(e=>e.classList.add('sheet-form-page'));
  await expect(page.locator('input')).toHaveCSS('min-height','52px');
  await expect(page.locator('input')).toHaveCSS('background-color','rgb(242, 239, 247)');
  await expect(page.locator('input')).toHaveCSS('border-radius','15px');
  await expect(page.locator('button')).toHaveCSS('background-color','rgb(217, 209, 227)');
  await page.locator('input').focus();
  await expect(page.locator('input')).toHaveCSS('outline-width','2px');
  await mount(page,'<body><div class="sheet-back sheet-menu"><section class="sheet"><div class="sheet-body"><button class="vz-choice">수정</button><button class="vz-choice" data-delete>삭제</button></div></section></div></body>');
  await expect(page.locator('.sheet')).toHaveCSS('border-radius','27px');
  await expect(page.locator('.sheet')).toHaveCSS('background-color','rgba(54, 51, 59, 0.92)');
  await expect(page.locator('.vz-choice').first()).toHaveCSS('min-height','56px');
  await expect(page.locator('[data-delete]')).toHaveCSS('color','rgb(255, 214, 223)');
});
test('standalone billing uses the same token source',async({page})=>{
  await mount(page,'<body><main class="billing"><h1>레슨비 정산</h1><section class="card">잔여 횟수</section></main></body>',['billing/billing.css']);
  await expect(page.locator('body')).toHaveCSS('background-color','rgb(248, 246, 253)');
  await expect(page.locator('.card')).toHaveCSS('border-radius','20px');
  expect(await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--accent').trim())).toBe('#7A32F5');
});
test('shadow home shares tokens and its local variables no longer mask changes',async({page})=>{
  for(const width of [320,390,430]){
    await page.setViewportSize({width,height:844});
    await page.goto('/design-system/student-home-preview.html');
    const host=page.locator('.vz-student-home');
    await expect(host.locator('.vz-phone')).toBeVisible();
    await expect(host.locator('.vz-phone')).toHaveCSS('padding-left','12px');
    await expect(host.locator('.vz-card').first()).toHaveCSS('padding','16px');
    await expect(host.locator('.vz-nav')).toHaveCSS('height','70px');
    await expect(host.locator('.vz-nav')).toHaveCSS('background-color','rgba(255, 255, 255, 0.58)');
    await expect(host.locator('.vz-nav')).toHaveCSS('backdrop-filter','blur(24px)');
    await expect(host.locator('.vz-floating-record')).toHaveCSS('width','56px');
    await host.locator('.vz-phone').evaluate(e=>e.style.setProperty('--vz-color-accent','#123456'));
    await expect(host.locator('.vz-logo svg')).toHaveCSS('color','rgb(18, 52, 86)');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});
test('reduced motion and increased contrast affect document and shadow home',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce',contrast:'more'});
  await mount(page,regular);
  await expect(page.locator('.v-nav')).toHaveCSS('background-color','rgb(255, 255, 255)');
  expect(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--vz-motion-normal').trim())).toBe('0ms');
  await page.goto('/design-system/student-home-preview.html');
  await expect(page.locator('.vz-student-home .vz-nav')).toHaveCSS('background-color','rgb(255, 255, 255)');
  await expect(page.locator('.vz-student-home .vz-nav')).toHaveCSS('backdrop-filter','none');
});

