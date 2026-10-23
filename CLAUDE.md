# CLAUDE.md

## Asking the user questions (user rule, 2026-10-23)

Whenever you need an answer or a decision from the user, ask simple multiple-choice questions with the AskUserQuestion tool:
- One short question per decision, 2–4 options each, with the recommended option first and marked "(Recommended)".
- Use multiSelect when more than one answer can apply.
- Never end a reply with open-ended questions in plain text.
- If no question tool is available (another agent, Claude Desktop), write numbered questions with lettered options (A/B/C) the user can answer in one line.
