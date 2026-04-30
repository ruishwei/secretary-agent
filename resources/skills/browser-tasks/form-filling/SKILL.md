---
name: form-filling
description: Detect and fill web forms with smart field matching. Use this skill whenever the user asks to fill out a form, register an account, or submit application data.
version: 1.0.0
---

# Form Filling Workflow

## When to use
- User asks to "fill out", "complete", or "submit" a form
- Registration, signup, checkout, application forms
- Any page with multiple input fields that need data entry

## Workflow

1. **Navigate to the form page** using `browser_navigate`
2. **Take a snapshot** with `browser_snapshot(full=true)` to see all form fields
3. **Identify fields**: Look for `[Input]`, `[Select]`, `[CheckBox]`, `[Radio]`, `[TextArea]` elements in the snapshot. Note their @ref IDs and associated labels.
4. **Ask the user** if any required information is missing (e.g., address, phone number, preferences)
5. **Use `browser_fill_form`** to fill all fields at once:
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
6. **Verify the filled form** with `browser_snapshot()` — check that values appear correctly
7. **Request review** with `browser_request_review(reason="Please review form before submission", reviewType="form-submit")` — NEVER submit without user approval
8. **After approval**, click the submit button by @ref

## Tips
- Use `browser_get_page_state` for a detailed form audit before filling
- For multi-page forms (wizards), repeat steps 2-6 for each page
- Radio buttons and checkboxes are handled by `browser_fill_form` — just include the label name and value "true"/"false"
- Select dropdowns accept the visible option text as the value
