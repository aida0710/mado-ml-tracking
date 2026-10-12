// Takes the two screenshots of "6. Check on screen" in the quickstart, from the Runs that
// seed_quickstart.py recorded in the sample environment. Read only.
//   node pages/scripts/screenshots/capture-quickstart.mjs [--lang en] [name ...]
import { launchBrowser, newDocsContext, signInForDevelopment } from './browserSession.mjs';
import { labelsFor } from './labels.mjs';
import { outputDirectory, saveScreenshot } from './publishableScreenshot.mjs';
import { runCaptures } from './runCaptures.mjs';
import { parseArguments, readEnvironment, readSeedState } from './screenshotEnvironment.mjs';

// Charts (canvas) keep drawing after the network is idle.
const RENDER_SETTLE_MS = 1500;

const { options, positional: only } = parseArguments(process.argv.slice(2));
const { lang } = options;
const label = labelsFor(lang);
const { webUrl } = await readEnvironment(lang, 'sample');
const { projectId, experimentId } = await readSeedState(lang, 'sample', 'quickstart-state.json');

const browser = await launchBrowser();
const directory = await outputDirectory(lang);
const context = await newDocsContext(browser, { lang });
await signInForDevelopment(context, webUrl);
const page = await context.newPage();

async function openExperiment() {
  await page.goto(`${webUrl}/projects/${projectId}/experiments?experiment=${experimentId}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(RENDER_SETTLE_MS);
}

const captures = {
  'guide-quickstart-runs': openExperiment,
  'guide-quickstart-chart': async () => {
    await openExperiment();
    await page.getByRole('button', { name: label.showCharts }).click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(RENDER_SETTLE_MS);
    // At 1440 px the parallel coordinates wrap below the charts; scroll so both are in view.
    await page
      .getByText(label.chartTarget, { exact: true })
      .first()
      .evaluate((element) => {
        element.scrollIntoView({ block: 'start' });
        window.scrollBy(0, -72);
      });
    await page.waitForTimeout(RENDER_SETTLE_MS);
  },
};

try {
  await runCaptures(captures, only, async (name, prepare) => {
    await prepare();
    await saveScreenshot(page, directory, name, { lang });
  });
} finally {
  await browser.close();
}
