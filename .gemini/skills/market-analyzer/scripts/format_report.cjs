/**
 * Formats market research data into a standardized Markdown report.
 * Expects research data in a specific JSON format.
 */

const fs = require('fs');

function formatReport(data) {
  let markdown = `# ${data.title}\n\n`;
  
  markdown += `## Executive Summary\n${data.summary}\n\n`;
  
  markdown += `## 2026 Market Summary: The Competition\n\n`;
  markdown += `| Product | Best For | Key Features (2026) |\n`;
  markdown += `| :--- | :--- | :--- |\n`;
  data.competitors.forEach(c => {
    markdown += `| **${c.name}** | ${c.bestFor} | ${c.features} |\n`;
  });
  
  markdown += `\n### The Competitive Gap\n`;
  data.gaps.forEach(g => {
    markdown += `*   **${g.title}:** ${g.description}\n`;
  });
  
  markdown += `\n---\n\n## Top 3 Product Opportunities for Success\n\n`;
  data.opportunities.forEach((o, i) => {
    markdown += `### ${i + 1}. ${o.title}\n`;
    markdown += `*   **Concept:** ${o.concept}\n`;
    markdown += `*   **Market Need:** ${o.marketNeed}\n`;
    markdown += `*   **Unique Value Prop:** ${o.uniqueValueProp}\n`;
    markdown += `*   **Target Market:** ${o.targetMarket}\n\n`;
  });
  
  markdown += `---\n\n## Strategic Recommendation\n${data.recommendation}\n`;
  
  return markdown;
}

// Example usage or CLI interface
if (require.main === module) {
  try {
    const inputPath = process.argv[2];
    if (!inputPath) {
      console.error("Usage: node format_report.cjs <data.json>");
      process.exit(1);
    }
    const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    console.log(formatReport(data));
  } catch (err) {
    console.error("Error formatting report:", err.message);
    process.exit(1);
  }
}

module.exports = { formatReport };
