import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});

const fresh = async (w, h) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  return { ctx, page };
};

// ---- desktop gallery ----
const { page } = await fresh(1280, 900);
await page.goto("http://localhost:3000/discover", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(3200);
await page.screenshot({ path: "C:/msys64/tmp/rc_gallery.png" });

const tiles = await page.$$("button[aria-pressed]");
console.log("gallery tiles:", tiles.length);
for (const i of [1, 5, 9]) { if (tiles[i]) { await tiles[i].click(); await page.waitForTimeout(250); } }
await page.screenshot({ path: "C:/msys64/tmp/rc_tapped.png" });

// wall 2 (button text is regex-matched on its visible label)
await page.locator("text=/Next wall/").first().click();
await page.waitForTimeout(2400);
await page.screenshot({ path: "C:/msys64/tmp/rc_wall2.png" });

// wall 2 done → depth grid
await page.locator("text=/Start the real thing/").first().click();
await page.waitForTimeout(3200);
await page.screenshot({ path: "C:/msys64/tmp/rc_depth.png" });
const depthCards = await page.$$("div[role='button']");
console.log("depth grid cards:", depthCards.length);
if (depthCards[2]) { await depthCards[2].click(); }
await page.waitForTimeout(900);
await page.screenshot({ path: "C:/msys64/tmp/rc_depth_tapped.png" });
await page.close();

// ---- mobile 375px ----
const m = await fresh(375, 812);
await m.page.goto("http://localhost:3000/discover", { waitUntil: "networkidle", timeout: 30000 });
await m.page.waitForTimeout(3800);
await m.page.screenshot({ path: "C:/msys64/tmp/rc_mobile.png" });
const overflow = await m.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log("mobile overflow px:", overflow);

await browser.close();
console.log("render check done");
