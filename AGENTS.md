# OpenCode Project Guidance

## gstack

Use gstack skills in OpenCode for planning, review,
QA, release work, browser automation, and safety workflows.

## Browser

For all web browsing, use `/gstack-browse`.
Never use `mcp__claude-in-chrome__*` tools.

## Skill Routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, and do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Prefer these skills when the task matches:

- Planning and idea refinement: `/gstack-office-hours`, `/gstack-autoplan`, `/gstack-plan-ceo-review`, `/gstack-plan-eng-review`, `/gstack-plan-design-review`, `/gstack-plan-devex-review`
- Design work: `/gstack-design-consultation`, `/gstack-design-shotgun`, `/gstack-design-html`, `/gstack-design-review`
- Code, DX, and security review: `/gstack-review`, `/gstack-devex-review`, `/gstack-cso`, `/gstack-health`
- Debugging and investigation: `/gstack-investigate`
- QA and browser workflows: `/gstack-browse`, `/gstack-qa`, `/gstack-qa-only`, `/gstack-benchmark`, `/gstack-canary`, `/gstack-setup-browser-cookies`, `/gstack-open-gstack-browser`, `/gstack-pair-agent`
- Release workflows: `/gstack-ship`, `/gstack-land-and-deploy`, `/gstack-setup-deploy`, `/gstack-document-release`, `/gstack-retro`
- Safety and workspace control: `/gstack-careful`, `/gstack-freeze`, `/gstack-guard`, `/gstack-unfreeze`, `/gstack-context-save`, `/gstack-context-restore`, `/gstack-learn`, `/gstack-upgrade`

Key routing rules:
- Product ideas, "is this worth building", brainstorming: invoke `/gstack-office-hours`
- Bugs, errors, "why is this broken", 500 errors: invoke `/gstack-investigate`
- Ship, deploy, push, create PR: invoke `/gstack-ship`
- QA, test the site, find bugs: invoke `/gstack-qa`
- Code review, check my diff: invoke `/gstack-review`
- Update docs after shipping: invoke `/gstack-document-release`
- Weekly retro: invoke `/gstack-retro`
- Design system, brand: invoke `/gstack-design-consultation`
- Visual audit, design polish: invoke `/gstack-design-review`
- Architecture review: invoke `/gstack-plan-eng-review`
- Save progress, checkpoint: invoke `/gstack-context-save`
- Resume, restore context: invoke `/gstack-context-restore`
- Code quality, health check: invoke `/gstack-health`

## Available Skills

`/gstack-autoplan`, `/gstack-benchmark`, `/gstack-browse`, `/gstack-canary`,
`/gstack-careful`, `/gstack-context-save`, `/gstack-context-restore`, `/gstack-cso`,
`/gstack-design-consultation`, `/gstack-design-html`, `/gstack-design-review`,
`/gstack-design-shotgun`, `/gstack-devex-review`, `/gstack-document-release`,
`/gstack-freeze`, `/gstack-guard`, `/gstack-health`, `/gstack-investigate`,
`/gstack-land-and-deploy`, `/gstack-learn`, `/gstack-office-hours`,
`/gstack-open-gstack-browser`, `/gstack-pair-agent`, `/gstack-plan-ceo-review`,
`/gstack-plan-design-review`, `/gstack-plan-devex-review`, `/gstack-plan-eng-review`,
`/gstack-qa`, `/gstack-qa-only`, `/gstack-retro`, `/gstack-review`,
`/gstack-setup-browser-cookies`, `/gstack-setup-deploy`, `/gstack-ship`,
`/gstack-unfreeze`, `/gstack-upgrade`.

When a task matches one of these workflows, prefer the corresponding gstack skill.

The `/gstack-*` form is the project-preferred command style. Depending on local gstack configuration, some underlying skill names may also exist without the prefix.
