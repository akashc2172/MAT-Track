const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    page.on('console', msg => console.log('CONSOLE:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(1000);
    await page.click('button:has-text("Initialize Data Engine")');
    await page.waitForTimeout(1500);
    await page.click('button:has-text("Proceed to Dashboard")');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/Users/akashc/.gemini/antigravity/brain/4505e3c5-6afb-4574-b7ea-2c18964e7957/master_table_ui.png', fullPage: true });
    console.log("Master Table Screenshot saved.");
    
    await page.click('button:has-text("Outreach Workspace")'); // Switch tabs
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/Users/akashc/.gemini/antigravity/brain/4505e3c5-6afb-4574-b7ea-2c18964e7957/outreach_tab_ui.png', fullPage: true });
    console.log("Outreach Tab Screenshot saved.");
    
    await browser.close();
})();
