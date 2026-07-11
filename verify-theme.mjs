import { chromium } from "playwright";

const URL = "http://localhost:8082/studio";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (err) => errors.push(String(err)));

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

await page.screenshot({ path: "/private/tmp/claude-501/-Users-jadahmad-Desktop-Repos-Valstine-studio/b115722d-4508-468c-8929-437015afe698/scratchpad/01-initial.png" });

// Open the theme menu via the sun/moon icon button in the title bar (title="Color theme")
const themeTrigger = page.locator('button[title="Color theme"]');
await themeTrigger.click();
await page.waitForTimeout(300);
await page.screenshot({ path: "/private/tmp/claude-501/-Users-jadahmad-Desktop-Repos-Valstine-studio/b115722d-4508-468c-8929-437015afe698/scratchpad/02-theme-menu.png" });

// Click "Light Modern" option
const lightModernItem = page.getByText("Light Modern", { exact: true });
await lightModernItem.click();
await page.waitForTimeout(500);
await page.screenshot({ path: "/private/tmp/claude-501/-Users-jadahmad-Desktop-Repos-Valstine-studio/b115722d-4508-468c-8929-437015afe698/scratchpad/03-light-modern.png" });

console.log("CONSOLE_ERRORS:", JSON.stringify(errors, null, 2));

await browser.close();
