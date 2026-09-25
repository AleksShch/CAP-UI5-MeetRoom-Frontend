const {test,expect}=require('@playwright/test');
const {loginBrowser}=require('./auth.cjs');
const user='60000000-0000-4000-8000-000000000001';
const room='50000000-0000-4000-8000-000000000001';
test.beforeEach(async({page,request})=>{
  await loginBrowser(page,request);
});
test('dashboard loads locally, links to resources and works on mobile',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Make room for a good day.'})).toBeVisible();
  await page.screenshot({path:'test-results/dashboard-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Find a space',exact:true}).first().click();
  await expect(page.getByRole('heading',{name:'Find a space',exact:true})).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  await page.reload();
  await expect(page.getByRole('heading',{name:'Find a space',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Hannover Desk 1'})).toBeVisible();
  await page.screenshot({path:'test-results/spaces-mobile.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  expect(errors).toEqual([]);
});
test('reserve from a floor plan, edit and cancel through My bookings',async({page,request})=>{
  await page.goto('/#spaces');
  await page.getByRole('button',{name:'Hannover Demo Desk 4, Available'}).click();
  await page.getByRole('button',{name:'Reserve',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Title',{exact:true}).fill('Browser reservation');
  await dialog.getByRole('button',{name:'Reserve',exact:true}).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button',{name:'My bookings',exact:true}).first().click();
  await expect(page.getByRole('heading',{name:'Browser reservation'})).toBeVisible();
  await page.locator('.bookingCard').filter({hasText:'Browser reservation'}).getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Title',{exact:true}).fill('Updated browser reservation');
  await page.getByRole('dialog').getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Updated browser reservation'})).toBeVisible();
  await page.locator('.bookingCard').filter({hasText:'Updated browser reservation'}).getByRole('button',{name:'Cancel reservation',exact:true}).click();
  await page.getByRole('alertdialog').getByRole('button',{name:'OK',exact:true}).click();
  await expect(page.getByText('Cancelled',{exact:true})).toBeVisible();
  const rows=(await(await request.get('/odata/v4/booking/Bookings')).json()).value.filter(row=>row.title.includes('browser reservation'));
  for(const row of rows)await request.delete(`/odata/v4/booking/Bookings(${row.ID})`);
});

test('language switch localizes navigation, dialogs, maps and display and survives reload',async({page})=>{
  // Set the initial language once so this test can check persistence after reload.
  await page.goto('/');
  await page.getByRole('combobox',{name:'Language',exact:true}).press('Space');
  await page.getByRole('option',{name:'German',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Platz für einen guten Tag.'})).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang','de');
  await expect(page).toHaveTitle('RsvRoom · Dein Platz zum Arbeiten');
  await page.getByRole('button',{name:'Arbeitsplatz finden',exact:true}).first().click();
  await page.getByRole('button',{name:'Hannover Demo Desk 4, Verfügbar'}).click();
  await page.getByRole('button',{name:'Reservieren',exact:true}).click();
  await expect(page.getByRole('dialog').getByLabel('Titel',{exact:true})).toHaveValue('Arbeiten im Büro');
  await page.getByRole('dialog').getByRole('button',{name:'Abbrechen',exact:true}).click();
  await page.reload();
  await expect(page.getByRole('heading',{name:'Arbeitsplatz finden',exact:true})).toBeVisible();
  await page.goto('/display/room/'+room);
  await expect(page.getByText('Verfügbar',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Vollbild'})).toBeVisible();
});
test('weekly plan persists across reloads',async({page,request})=>{
  const endpoint='/odata/v4/booking/WorkDays';
  const ownRows=async()=>(await(await request.get(endpoint)).json()).value.filter(row=>row.user_ID===user);
  const original=new Map((await ownRows()).map(row=>[row.ID,row]));
  try {
  await page.goto('/#schedule');
  await expect(page.getByRole('heading',{name:'My work week'})).toBeVisible();
  const mode=page.getByLabel('Work plan',{exact:true}).first();
  await mode.press('Space');await page.getByRole('option',{name:'Home office',exact:true}).click();
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(page.getByText('Your week is saved.',{exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Work plan',{exact:true}).first()).toContainText('Home office');
  const rows=await ownRows();
  expect(rows.some(row=>row.user_ID===user&&row.mode==='HOME')).toBe(true);
  } finally {
    for(const row of await ownRows()) {
      const saved=original.get(row.ID);
      if(!saved) await request.delete(`${endpoint}(${row.ID})`);
      else {
        const fields=['mode','site_ID','startTime','endTime','notes'];
        if(fields.some(key=>row[key]!==saved[key]))
          expect((await request.patch(`${endpoint}(${row.ID})`,{data:Object.fromEntries(fields.map(key=>[key,saved[key]]))})).ok()).toBe(true);
      }
    }
  }
});
test('direct kiosk URL shows a room without a profile dialog',async({page})=>{
  await page.goto('/display/room/'+room);
  await expect(page.getByRole('heading',{name:'Hannover Meeting Room'})).toBeVisible();
  await expect(page.getByText('Available',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Full screen'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Administration'})).toHaveCount(0);
  await page.screenshot({path:'test-results/room-display.png',fullPage:true});
});
test('administration creates and deletes a room using backend data',async({page})=>{
  await page.goto('/#admin');
  await expect(page.getByRole('heading',{name:'Administration'})).toBeVisible();
  await page.locator('.adminToolbar .sapMSlt').click();
  await page.getByRole('option',{name:'Resources',exact:true}).click();
  await page.getByRole('button',{name:'Add entry',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Code',{exact:true}).fill('BROWSER-ROOM');
  await dialog.getByLabel('Name',{exact:true}).fill('Browser meeting room');
  await dialog.getByRole('button',{name:'Save changes'}).click();
  await expect(dialog).not.toBeVisible();
  const row=page.getByRole('row').filter({hasText:'BROWSER-ROOM'});
  await expect(row).toBeVisible();
  await row.getByRole('button',{name:'Delete',exact:true}).click();
  await page.getByRole('alertdialog').getByRole('button',{name:'OK',exact:true}).click();
  await expect(row).toHaveCount(0);
});
