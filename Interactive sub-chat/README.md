# DIAGNOSTIC_CORE_v2.5
## High-Entropy Elicitation Orchestrator

### Overview
`DIAGNOSTIC_CORE` as your specialised React-based interface designed to run inside **Gemini Canvas**. It acts as a diagnostic layer between raw, messy context (meeting notes, logs, briefs) and a final structured output.

### Core Concept: "Ask Less, Solve More"
Unlike standard chatbots that ask generic follow-ups, this agent uses a diagnostic protocol to identify the *minimum* number of questions needed to resolve ambiguity.

*   **Entropy Resolution:** Only asks questions where the answer materially changes the output branch.
*   **Hedge Preservation:** Strictly preserves user uncertainty (e.g., "maybe," "kind of-" "not sure") without upgrading it to false confidence.
*   **Intent-Driven:** Shapes the "Current Best Guess" live based on specific goals: Enrich, Recommend, or Stress-test.

### Technical Orchestration
*   **Environment:** Optimised for Gemini Canvas. It is designed to be pasted directly into the .tsx or .jsx preview window.
*   **Authentication:** Zero-config. Relies on the host container's environment variables to inject API keys securely. It does not store keys locally.
*   **UI/UX:** High-contrast, WCAG 2.0 compliant terminal theme designed for low-light technical environments.


### Roadmap
- [x] Gemini 2.5 Flash / Pro Integration
- [ ] Claude 4.x Integration (**COMING SOON**)
- [ ] Local Storage Persistence

---
*Built for the technical elite who value signal over noise.*