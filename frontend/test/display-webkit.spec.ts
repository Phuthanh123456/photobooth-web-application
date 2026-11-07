import { test, expect } from '@playwright/test';

test('WebKit iPad display receives server countdown and active reset without operator controls',async({browser,page})=> {
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/operator');await expect(page.getByText('Connected',{exact:true})).toBeVisible();
  const context=await browser.newContext({viewport:{width:1024,height:768},isMobile:true,hasTouch:true});
  const display=await context.newPage();display.on('pageerror',error=>errors.push(error.message));
  await display.goto('/display');await expect(display.getByText('Connected',{exact:true})).toBeVisible();
  await expect(display.getByRole('button')).toHaveCount(0);
  await page.getByRole('button',{name:'Start Session'}).click();
  await expect(display.locator('.countdown')).toHaveText('10');
  await expect(display.getByRole('heading',{name:'Photo 1 of 4'})).toBeVisible();
  await display.reload();await expect(display.locator('.countdown')).toBeVisible();
  await page.getByRole('button',{name:'Reset / Retake'}).click();
  await expect(page.locator('.status-row h2')).toHaveText('IDLE');
  await expect(display.getByRole('heading',{name:'Get Ready'})).toBeVisible();
  await expect(display.locator('.countdown')).toHaveCount(0);
  expect(await display.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);await context.close();
});
