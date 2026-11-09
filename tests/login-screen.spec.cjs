const {test,expect}=require('@playwright/test');

test('Login screen keeps the three account actions clear and usable',async({page})=>{
  await page.route('**/supabase.min.js',route=>route.fulfill({contentType:'application/javascript',body:`window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:null}}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signInWithPassword:async()=>({error:{message:'Invalid login credentials'}}),signUp:async()=>({data:{session:null},error:null}),resetPasswordForEmail:async()=>({error:null})}})}` }));
  await page.route('**/r2-config.js*',route=>route.fulfill({contentType:'application/javascript',body:"window.VZIP_R2_ENDPOINT='';"}));
  page.on('dialog',dialog=>dialog.accept());
  await page.goto('/#/home');
  const screen=page.locator('#vzip-auth-screen');
  await expect(screen).toBeVisible();
  await expect(screen.locator('.vzip-auth-card h3')).toHaveText('로그인');
  await expect(screen.getByRole('button',{name:'로그인',exact:true})).toBeVisible();
  await expect(screen.getByRole('button',{name:'비밀번호를 잊으셨나요?'})).toBeVisible();
  await expect(screen.getByRole('button',{name:'입력한 이메일로 가입하기'})).toBeVisible();
  if(process.env.VZ_QA_OUTPUT)await page.screenshot({path:process.env.VZ_QA_OUTPUT+'/login-screen.png'});
  await screen.locator('#cloud-email').fill('test@example.com');
  await screen.locator('#cloud-password').fill('password123');
  await screen.getByRole('button',{name:'로그인',exact:true}).click();
  await expect(screen.locator('#vzip-auth-message')).toContainText('이메일 또는 비밀번호가 맞지 않아요');
  await screen.getByRole('button',{name:'비밀번호를 잊으셨나요?'}).click();
  await expect(screen.locator('#vzip-auth-message')).toContainText('재설정 메일을 확인');
  await screen.getByRole('button',{name:'입력한 이메일로 가입하기'}).click();
  await expect(screen.locator('#vzip-auth-message')).toContainText('가입 요청 완료');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
