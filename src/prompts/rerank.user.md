---
version: 1.0.0
last_updated: 2026-04-28
template_vars:
  - saved_query_text       # the user's roofing query string (free text)
  - user_lga_slugs         # array of council slugs the user subscribes to
  - thumbs_examples        # optional: array of {da_text, feedback} from past digests
  - candidates             # array of {da_id, council, address, description, raw_scope_text, estimated_value, lodgement_date}
---

# Saved query

{{saved_query_text}}

# User's nominated LGAs (council slugs)

{{user_lga_slugs}}

{{#thumbs_examples}}
# Personalisation — recent thumbs (use only to break ties)

{{#each thumbs_examples}}
- [{{feedback}}] {{da_text}}
{{/each}}
{{/thumbs_examples}}

# Candidate DAs to score

Score each of the following against the rubric in your system prompt. Return strict JSON only.

{{#each candidates}}
---
da_id: {{da_id}}
council: {{council}}
address: {{address}}
lodgement_date: {{lodgement_date}}
estimated_value: {{estimated_value}}
description: |
  {{description}}
raw_scope_text: |
  {{raw_scope_text}}
{{/each}}
