const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const DEFAULT_THEME_COLOR = '#007AFF';
const DEFAULT_BG_COLOR = '#0A0A1A';

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    title: '',
    subtitle: '',
    background: '',
    concepts: [],
    workflow: '',
    pros: [],
    cons: [],
    analogy: '',
    scenarios: [],
    takeaways: [],
    themeColor: DEFAULT_THEME_COLOR,
    layout: 'vertical',
    output: './output.png'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--title') config.title = args[++i];
    else if (arg === '--subtitle') config.subtitle = args[++i];
    else if (arg === '--background') config.background = args[++i];
    else if (arg === '--concepts') config.concepts = args[++i].split('|');
    else if (arg === '--workflow') config.workflow = args[++i];
    else if (arg === '--pros') config.pros = args[++i].split('|');
    else if (arg === '--cons') config.cons = args[++i].split('|');
    else if (arg === '--analogy') config.analogy = args[++i];
    else if (arg === '--scenarios') config.scenarios = args[++i].split('|');
    else if (arg === '--takeaways') config.takeaways = args[++i].split('|');
    else if (arg === '--theme-color') config.themeColor = args[++i];
    else if (arg === '--layout') config.layout = args[++i];
    else if (arg === '--output') config.output = args[++i];
  }

  return config;
}

function buildConceptCards(concepts) {
  return concepts.map((c, i) => {
    const [name, desc] = c.split(':');
    const icons = ['📦', '⚡', '🔄', '🎯', '💡', '🔮'];
    return `
      <div class="concept-card">
        <div class="concept-icon">${icons[i % icons.length]}</div>
        <div class="concept-content">
          <div class="concept-name">${name}</div>
          <div class="concept-desc">${desc}</div>
        </div>
      </div>
    `;
  }).join('');
}

function buildWorkflowSteps(workflow) {
  const steps = workflow.split('→').map(s => s.trim());
  return steps.map((step, i) => `
    <div class="workflow-step">
      <div class="step-number">${i + 1}</div>
      <div class="step-text">${step}</div>
    </div>
    ${i < steps.length - 1 ? '<div class="workflow-arrow">→</div>' : ''}
  `).join('');
}

function buildListItems(items, type = 'bullet') {
  return items.map(item => `<li>${item}</li>`).join('');
}

function buildScenarioItems(scenarios) {
  const icons = ['🏗️', '📱', '☁️', '🎮', '💰', '📊'];
  return scenarios.map((s, i) => `
    <div class="scenario-item">
      <span class="scenario-icon">${icons[i % icons.length]}</span>
      <span>${s}</span>
    </div>
  `).join('');
}

function buildTakeawayCards(takeaways) {
  return takeaways.map((t, i) => `
    <div class="takeaway-card">
      <div class="takeaway-number">${i + 1}</div>
      <div class="takeaway-text">${t}</div>
    </div>
  `).join('');
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 122, b: 255 };
}

function generateHTML(config) {
  const rgb = hexToRgb(config.themeColor);
  const templatePath = path.join(__dirname, '..', 'templates', `${config.layout}.html`);

  if (!fs.existsSync(templatePath)) {
    console.error(`Template not found: ${templatePath}`);
    process.exit(1);
  }

  let html = fs.readFileSync(templatePath, 'utf-8');

  html = html.replace(/{{TITLE}}/g, config.title);
  html = html.replace(/{{SUBTITLE}}/g, config.subtitle);
  html = html.replace(/{{BACKGROUND}}/g, config.background);
  html = html.replace(/{{CONCEPT_CARDS}}/g, buildConceptCards(config.concepts));
  html = html.replace(/{{WORKFLOW_STEPS}}/g, buildWorkflowSteps(config.workflow));
  html = html.replace(/{{PROS}}/g, buildListItems(config.pros));
  html = html.replace(/{{CONS}}/g, buildListItems(config.cons));
  html = html.replace(/{{ANALOGY}}/g, config.analogy);
  html = html.replace(/{{SCENARIO_ITEMS}}/g, buildScenarioItems(config.scenarios));
  html = html.replace(/{{TAKEAWAY_CARDS}}/g, buildTakeawayCards(config.takeaways));

  html = html.replace(/{{THEME_COLOR}}/g, config.themeColor);
  html = html.replace(/{{THEME_RGB}}/g, `${rgb.r}, ${rgb.g}, ${rgb.b}`);
  html = html.replace(/{{ACCENT_R}}/g, String(rgb.r));
  html = html.replace(/{{ACCENT_G}}/g, String(rgb.g));
  html = html.replace(/{{ACCENT_B}}/g, String(rgb.b));

  return html;
}

async function main() {
  const config = parseArgs();

  if (!config.title) {
    console.error('Error: --title is required');
    process.exit(1);
  }

  const html = generateHTML(config);
  const outputPath = path.resolve(config.output);

  const browser = await chromium.launch();
  const page = await browser.newPage();

  const viewport = config.layout === 'vertical'
    ? { width: 540, height: 960 }
    : { width: 960, height: 540 };

  await page.setViewportSize(viewport);
  await page.setContent(html, { waitUntil: 'networkidle' });

  await page.screenshot({
    path: outputPath,
    type: outputPath.endsWith('.jpg') ? 'jpeg' : 'png',
    fullPage: true
  });

  await browser.close();
  console.log(`Infographic saved to: ${outputPath}`);
}

main().catch(console.error);
