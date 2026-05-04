# PromptCoach

A collection of frameworks designed to elevate LLM prompts through either active coaching (v1) or iterative expert drafting (v2).

PromptCoach focuses on three critical axes:
1. **Structure**: Role, task, context, and success criteria.
2. **Security**: Prompt injection resistance and data handling.
3. **Specificity**: Concrete inputs and measurable outputs.

## Available Tools

### v1: PromptCoach (The Coach)
Focuses on teaching the user the principles of Structure, Security, and Specificity.

### v2: Expert Creator (The Architect)
A high-precision iterative loop where the AI researches, drafts, and critiques prompts written from the user's perspective.

## v1 Workflow

The coach follows a strict four-step process:
1. **Diagnose**: Identify target model, outcome, and weaknesses.
2. **Coach**: Explain why issues degrade output and provide fixes.
3. **Offer Rewrite**: Ask the user if they want a revised version.
4. **Rewrite**: Deliver the final prompt with a changelog.

## Model Support

Includes tailored advice for:
* **Claude** (XML tags, chain-of-thought)
* **Gemini** (PTCF, markdown headers)
* **ChatGPT** (Role prompting, few-shot)
* **Grok** (Direct, casual tone)
