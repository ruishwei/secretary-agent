---
name: data-extraction
description: Extract structured data from web pages (tables, lists, product details, prices). Use when the user asks to "get data", "scrape", "extract information", or "find prices" from a website.
version: 1.0.0
---

# Data Extraction Workflow

## When to use
- User asks to extract prices, product info, contact details
- Gathering data from search results, directories, or listings
- Comparing information across multiple pages

## Workflow

1. **Navigate to the target page** using `browser_navigate`
2. **Take a full snapshot** with `browser_snapshot(full=true)`
3. **Analyze the snapshot** to identify the data structure:
   - Tables: note column headers and row patterns
   - Lists: note repeating item structures
   - Cards: note the container elements for each item
4. **Use `browser_extract`** with a clear description of what to extract:
   ```json
   {
     "what": "Extract all product names, prices, and ratings from the search results page. Return as a JSON array with fields: title, price, rating, url."
   }
   ```
   The tool uses the LLM to intelligently parse the page content.
5. **For multi-page data**, use `browser_scroll` or navigate to next page, then repeat extraction
6. **For complex visual layouts**, use `browser_vision` with a specific question:
   ```json
   { "question": "What are the prices shown in the comparison table? List each product and its price." }
   ```
7. **Summarize findings** for the user in a clear format (table or list)

## Tips
- Be specific in `browser_extract` about the output format you want
- For JavaScript-heavy pages, use `browser_wait(text="expected content")` after navigation
- Use `browser_console` to check for errors if extraction returns unexpected results
- `browser_vision` is useful for CAPTCHAs and image-based content that isn't in the DOM
- Save successful extraction patterns as skills for specific websites using `skill_create`
