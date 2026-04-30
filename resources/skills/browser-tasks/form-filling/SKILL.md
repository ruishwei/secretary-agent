---
name: form-filling
description: Detect and fill web forms with smart field matching. Use this skill whenever the user asks to fill out a form, register an account, or submit application data.
version: 1.1.0
---

# Form Filling Workflow

## When to use
- User asks to "fill out", "complete", or "submit" a form
- Registration, signup, checkout, application forms
- Any page with multiple input fields that need data entry

## Strategy: DOM-First, Vision-Fallback

**Always use DOM-based form interaction.** `browser_snapshot` reveals all form elements with their @ref IDs. `browser_fill_form` matches fields by label/name/placeholder. Only fall back to `browser_vision` when the form is rendered inside a `<canvas>` or uses custom WebGL-rendered controls invisible to the accessibility tree.

| Priority | Method | When |
|----------|--------|------|
| 1 | `browser_snapshot` + `browser_fill_form` | Default — handles text, select, checkbox, radio |
| 2 | `browser_snapshot` + individual `browser_click`/`browser_type` | Complex custom widgets, date pickers |
| 3 | `browser_vision` | Canvas-rendered forms, CAPTCHA challenges |

## Workflow

1. **Navigate to the form page** using `browser_navigate`
2. **Wait for the form to render**: `browser_wait(text="expected field label")`
3. **Take a snapshot** with `browser_snapshot(full=true)` to see all form fields
4. **Identify fields**: Look for `[Input]`, `[Select]`, `[CheckBox]`, `[Radio]`, `[TextArea]` elements. Note their @ref IDs and associated labels. Use `browser_get_page_state` for a detailed form audit if the page is complex.
5. **Ask the user** if any required information is missing (e.g., address, phone number, preferences)
6. **Use `browser_fill_form`** to fill all fields at once:
   ```json
   {
     "fields": {
       "First Name": "John",
       "Last Name": "Doe",
       "Email": "john@example.com",
       "Phone": "+1 555-0123"
     }
   }
   ```
   The tool matches field labels/names/placeholders automatically.
7. **Verify the filled form** with `browser_snapshot()` — check that values appear correctly
8. **Request review** with `browser_request_review(reason="Please review form before submission", reviewType="form-submit")` — NEVER submit without user approval
9. **After approval**, click the submit button by @ref

## Fallback: When DOM filling fails

If `browser_fill_form` can't find fields or values don't stick:
1. Use `browser_get_page_state` to audit field states
2. Try individual `browser_type(ref, "value")` for problematic fields
3. Use `browser_click(ref)` for custom dropdowns or toggle buttons
4. Only as last resort, use `browser_vision` to understand the form layout

## Tips
- For multi-page forms (wizards), repeat steps 2-7 for each page
- Radio buttons and checkboxes: include the label name with value "true"/"false"
- Select dropdowns: use the visible option text as the value
- Date pickers often require individual `browser_click` on calendar cells
- If a field value gets cleared after filling, try `browser_press("Tab")` before moving on
