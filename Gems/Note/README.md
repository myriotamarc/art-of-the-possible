# G-Note: Structured Note Enrichment (Gem)

G-Note is a custom Google Gemini "Gem" designed for IT and Cyber Security leadership. It serves as the primary ingestion and standardisation layer for raw intelligence.

## Gem Configuration
* **Name:** Notetaker
 * **Knowledge Source:** Integrated with "WIP Notes" via **NotebookLM**.
 * **Settings:** Knowledge citations are disabled to maintain strict template adherence.

## Core Foundations
* **Structured Extraction:** Forces raw input into a fixed template (Date, Status, Topics).
* **Cyber Context:** Tuned for Governance, Compliance, and Security Operations.
* **Enrichment:** Automatically expands acronyms, resolves vague references, and highlights action items.

## Output Schema
```
[DATE or TIMEFRAME]
[STATUS TAG]
[METADATA TOPIC TAG(s)]
[SUMMARY / TITLE / TOPIC]
[PARTICIPANTS]
[Enriched summary]
**
[RAW NOTES]
**
```