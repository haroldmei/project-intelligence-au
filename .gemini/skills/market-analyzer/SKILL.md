---
name: market-analyzer
description: Conducts comprehensive market research, competitor analysis, and product ideation. Use this skill when the user asks for market landscapes, competitive research, trend analysis, or suggestions for high-potential product ideas in a specific niche.
---

# Market Analyzer

## Overview
This skill enables systematic market research and product strategy generation. It uses a structured framework to identify competitors, detect market gaps, and propose defensible product opportunities.

## Workflow: Research to Strategy

### 1. Research & Analysis
Follow the [Market Research Framework](references/framework.md) to gather data. 
- Conduct broad Google searches to identify top 5-7 competitors.
- Analyze their features, pricing, and target audience.
- Search for 2026 trends and regulatory shifts (e.g., AI Acts, technical standards).

### 2. Gap Identification
Based on the research, identify exactly where existing products are failing. Look specifically for:
- **Linguistic/Technical bias** (e.g., against ESL speakers).
- **Structural vs. Syntax gaps** (e.g., logic theft).
- **Process vs. Outcome verification** (e.g., proving the human labor vs. checking the final text).

### 3. Product Ideation
Generate 3 distinct product ideas that exploit the identified gaps. Each idea must include:
- **Concept**: High-level description.
- **Market Need**: The specific pain point it solves.
- **Unique Value Prop**: Why it wins against incumbents.
- **Target Market**: The primary customer segment.

### 4. Report Generation
Collect all findings into a JSON format and use the [format_report.cjs](scripts/format_report.cjs) script to generate the final Markdown report.

**JSON Schema for `format_report.cjs`:**
```json
{
  "title": "String",
  "summary": "String (Markdown supported)",
  "competitors": [
    { "name": "String", "bestFor": "String", "features": "String" }
  ],
  "gaps": [
    { "title": "String", "description": "String" }
  ],
  "opportunities": [
    { "title": "String", "concept": "String", "marketNeed": "String", "uniqueValueProp": "String", "targetMarket": "String" }
  ],
  "recommendation": "String (Markdown supported)"
}
```

## Resources

- **references/framework.md**: Detailed step-by-step guide for research queries and gap detection.
- **scripts/format_report.cjs**: Utility to ensure consistent reporting structure.
