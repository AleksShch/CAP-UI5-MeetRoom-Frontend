const { expect } = require('@playwright/test');

async function loginRequest(request, email) {
  const result=await(await request.get('/auth/profiles')).json();
  const profiles=Array.isArray(result)?result:result.value;
  const user=profiles.find(row=>row.email===email);
  expect(user,'The selected profile exists').toBeTruthy();
  const response=await request.post('/auth/login',{data:{userID:user.ID}});
  expect(response.ok(),await response.text()).toBe(true);
  return response;
}

async function loginBrowser(page, request, email = 'anna@example.com') {
  await loginRequest(request,email);
  await page.context().addCookies((await request.storageState()).cookies);
  await page.addInitScript(() => { if (!localStorage.getItem('rsvroom.language')) localStorage.setItem('rsvroom.language', 'en'); });
}

module.exports = { loginBrowser, loginRequest };
