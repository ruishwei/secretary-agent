---
name: data-extraction
category: browser-tasks
description: Extract structured data from web pages (tables, lists, product details, prices). Use when the user asks to "get data", "scrape", "extract information", or "find prices" from a website.
version: 1.1.0
---

# Data Extraction Workflow

## When to use
- User asks to extract prices, product info, contact details
- Gathering data from search results, directories, or listings
- Comparing information across multiple pages

## Strategy: DOM-First, Vision-Fallback

**Always start with DOM-based tools.** They are fast, precise, and cost-effective. Only fall back to `browser_vision` when the DOM approach fails.

| Priority | Method | When |
|----------|--------|------|
| 1 | `browser_snapshot` + `browser_extract` | Default — works for 90% of pages |
| 2 | `browser_snapshot` + manual `browser_click`/`browser_type` | Interactive pages (load more, filters) |
| 3 | `browser_vision` | Canvas-rendered content, CAPTCHAs, image-only data |

## Workflow

1. **Navigate to the target page** using `browser_navigate`
2. **Wait for content** if needed: `browser_wait(text="expected content")`
3. **Take a full snapshot** with `browser_snapshot(full=true)`
4. **Analyze the snapshot** to identify the data structure:
   - Tables: note column headers and row patterns
   - Lists: note repeating item structures (@ref IDs for each item)
   - Cards: note the container elements for each item
5. **Use `browser_extract`** with a precise description of what to extract:
   ```json
   {
     "what": "Extract all product names, prices, and ratings from the search results page. Return as a JSON array with fields: title, price, rating, url."
   }
   ```
   `browser_extract` uses the LLM to parse the accessibility tree — no screenshot needed.
6. **For multi-page data**, use `browser_scroll` to reveal more items or navigate to next page, then repeat extraction
7. **If DOM extraction returns incomplete or empty results**, diagnose with `browser_console` to check for JS errors or dynamic loading issues
8. **Summarize findings** for the user in a clear format (table or list)

## Fallback: Vision-based extraction

Use `browser_vision` ONLY when:
- The page content is rendered on a `<canvas>` element (no DOM nodes)
- A CAPTCHA blocks automated access
- The data is in an image/chart that the accessibility tree can't parse

```json
{ "question": "What are the prices shown in the comparison table? List each product and its price." }
```

Vision is slower and more expensive. Prefer DOM methods.

## Tips
- Be specific in `browser_extract` about the output format you want
- For JavaScript-heavy pages, use `browser_wait(text="expected content")` after navigation
- Use `browser_console` to check for errors if extraction returns unexpected results
- Save successful extraction patterns as skills for specific websites using `skill_create`
