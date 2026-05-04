import React, { useState, useEffect, useRef } from 'react';
import {
  BrainCircuit, Zap, Target, Cpu, Shield, RotateCcw, Send,
  CheckCircle2, Clipboard, AlertTriangle,
  Loader2, BarChart3, Sparkles, XCircle, Gauge, Compass,
  Info, HelpCircle, Terminal
} from 'lucide-react';

export default function App() {
  // Flow
  const [step, setStep] = useState('setup');
  const [context, setContext] = useState('');
  const [provider, setProvider] = useState('gemini'); // 'claude' | 'gemini'
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash');
  const [intent, setIntent] = useState('auto'); // auto | enrich | recommend | stress_test
  const [errorMessage, setErrorMessage] = useState(null);

  // Turn
  const [conversation, setConversation] = useState([]);
  const [currentOptions, setCurrentOptions] = useState([]);
  const [currentInput, setCurrentInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [budgetEditOpen, setBudgetEditOpen] = useState(false);
  const [showDocs, setShowDocs] = useState(false);

  // Diagnostic state
  const [overview, setOverview] = useState('');
  const [openQuestions, setOpenQuestions] = useState([]);
  const [resolved, setResolved] = useState([]);
  const [currentBestGuess, setCurrentBestGuess] = useState('');
  const [mode, setMode] = useState('clarify');
  const [isComplete, setIsComplete] = useState(false);
  const [questionsAsked, setQuestionsAsked] = useState(0);
  const [questionBudget, setQuestionBudget] = useState(6);
  const [proposedBudget, setProposedBudget] = useState(null);
  const [budgetOverridden, setBudgetOverridden] = useState(false);
  const QUESTION_BUDGET = questionBudget;

  const chatEndRef = useRef(null);

  // ============================================================
  // Provider / model catalog
  // ============================================================
  const providerCatalog = {
    claude: {
      label: 'Claude',
      default: 'claude-sonnet-4-6',
      models: [
        { id: 'claude-opus-4-7', name: 'Opus 4.7', desc: 'Deepest reasoning. Use for multi-layered or high-stakes contexts where nuance matters more than speed.', recommended: false },
        { id: 'claude-sonnet-4-6', name: 'Sonnet 4.6', desc: 'Balanced. Strong schema adherence and preserves hedging well. Default choice for most runs.', recommended: true },
        { id: 'claude-haiku-4-5', name: 'Haiku 4.5', desc: 'Fastest. Use for short contexts or when iterating quickly; less nuanced than Sonnet.', recommended: false }
      ]
    },
    gemini: {
      label: 'Gemini',
      default: 'gemini-2.5-flash',
      models: [
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', desc: 'Most reliable Gemini for this tool. Best schema adherence of the Gemini models. Default choice.', recommended: true },
        { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', desc: 'Deepest Gemini reasoning but inconsistent on structured output. Try if 2.5 Flash stops early.', recommended: false },
        { id: 'gemini-2.5-flash-preview-09-2025', name: 'Gemini 2.5 Flash (Preview)', desc: 'Preview build. Similar to 2.5 Flash; use only to compare against the stable version.', recommended: false },
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', desc: 'Newest but the most prone to hallucination and leading questions. Not recommended for enrich mode.', recommended: false }
      ]
    }
  };

  const currentModels = providerCatalog[provider].models;
  const currentModelInfo = currentModels.find(m => m.id === selectedModel);

  // Switch provider -> reset to that provider's default model
  const handleProviderChange = (p) => {
    setProvider(p);
    setSelectedModel(providerCatalog[p].default);
  };

  // ============================================================
  // Intent options
  // ============================================================
  const intents = [
    { id: 'auto', name: 'Ask me', desc: 'Agent asks which intent you want as the first question' },
    { id: 'enrich', name: 'Enrich notes', desc: 'Organize and fill gaps in source material' },
    { id: 'recommend', name: 'Recommend actions', desc: 'Produce concrete next steps' },
    { id: 'stress_test', name: 'Stress-test assumptions', desc: 'Challenge the context, find blind spots' }
  ];

  const intentDirective = {
    auto: 'Intent is not set. On turn 0, your first question must ask the user to pick between enrich, recommend, and stress_test. Do not attempt a currentBestGuess shape on turn 0 under auto; set currentBestGuess to a short placeholder noting the intent will be decided by the user.',
    enrich: 'The user wants enriched notes: an organized rewrite of the source material with gaps filled. Do not invent solutions. Your currentBestGuess should be a structured version of the notes, not recommendations.',
    recommend: 'The user wants concrete recommendations: specific next actions they can take. Your currentBestGuess should be actionable steps, not just a restatement of the situation.',
    stress_test: 'The user wants assumptions challenged: identify blind spots, contradictions, and untested claims. Your currentBestGuess should surface the most fragile assumption and what would falsify it.'
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation, isLoading]);

  // ============================================================
  // System prompt (provider-agnostic content)
  // ============================================================
  const buildSystemPromptBody = (phase) => `
You are a diagnostic elicitation agent. You ask the minimum number of questions needed to produce a good output for the user's intent. Asking unnecessary questions is a failure, not thoroughness.

USER INTENT: ${intentDirective[intent]}
PHASE: ${phase}
QUESTION BUDGET: ${QUESTION_BUDGET} (ceiling, not target)
QUESTIONS ASKED SO FAR: ${questionsAsked}

## Core rules

Never invent specifics the user did not state: dates, numbers, standards, frequencies, tools, acronyms, named people, named systems. If the user wrote "compliance audit", do not write "ISO 27001" unless they confirmed the number. If they wrote "auth timeout issues", do not specify duration or affected service.

Preserve the user's own hedges verbatim: "moderate", "still learning", "kind of", "not sure", "amber", "major". Do not upgrade "major" to "critical" or soften "blocking" to "slowing".

Plain, direct English. No hedging in your own reasoning, no "it depends", no corporate softening.

## Intent shapes currentBestGuess

- enrich: structured rewrite of the source notes, organized and with gaps named. Not recommendations.
- recommend: concrete next actions the user can take. Not a restatement of the situation.
- stress_test: the single most fragile assumption in the context, plus what would falsify it. Not a summary.
- auto: on turn 0, do not attempt a shape. Ask the user which intent they want (enrich, recommend, stress_test) as the first question, with those three as options.

If currentBestGuess does not match the intent shape, the response is invalid.

## Turn protocol

1. Update \`overview\` only if new information changed it. Overview is a one-paragraph factual restatement of the situation with hedges intact. It is not the recommendation.

2. Update \`openQuestions\`. Remove any the user actually answered this turn and list their ids in \`resolvedThisTurn\`. A tangent, partial, or non-answer does not resolve a question. Add new gaps the answer exposed. Ids are stable across turns.

3. Write \`currentBestGuess\`: what you would produce right now if the user said "just proceed with your best judgement". Match the intent shape. When the context has a gap (missing detail, acronym, unconfirmed fact), surface it visibly with "not captured", "unconfirmed", or "[detail needed]". Do not fill with plausible guesses.

4. Decide \`wouldAskingChangeAnswer\`:
   - If currentBestGuess is actionable for the intent and well-justified, set false and isComplete true.
   - If the top openQuestion's answer would materially change currentBestGuess, set true.
   - Marginal refinements do not count. "Slightly more detailed" is not material.
   - Gaps that can be marked unknown in the output do not justify asking.
   - After the question budget is reached, isComplete must be true regardless of remaining gaps.

5. If continuing, pick the openQuestion whose answer most changes currentBestGuess. For contexts with three or more distinct issues, prefer a question that resolves the most consequential fact about the highest-stakes issue. Never ask a meta-question about which issue to focus on, which area to prioritise, or what the user wants emphasised. That is the user's choice, not yours to elicit. Write \`nextQuestion\`, maximum 15 words. Set \`questionClosesId\` to that question's id.

6. Validate nextQuestion before committing:
   - Does it assume a premise not in the context? Example: "which server cluster is failing?" presupposes a failure exists. If yes, rewrite or drop.
   - Is the answer predictable from already-answered questions? If yes, drop.
   - Is it asking two things at once, or confirming something already stated? If yes, rewrite or drop.
   - Contradictions in the context are worth asking about.

7. Generate 2 to 4 options for nextQuestion. Each must:
   - Be a plausible answer to the question as written.
   - Lead to a materially different recommendation, stated in \`implication\`.
   - Be mutually exclusive and a single answer, not a concatenation.
   - Never write an option whose label contains multiple candidate answers joined by arrows, slashes, or "->". One option is one answer.
   - Merge any two options that would produce the same recommendation.
   - Exception: when nextQuestion is about which intent to use (auto mode, turn 0), the options are the three intents themselves and \`implication\` is the output shape each would produce.

8. Set \`mode\`: "clarify" if you still need facts, "decide" if the user is now picking between actions.

## Output schema

{
  "overview": string,
  "openQuestions": [{"id": "q1", "text": "..."}],
  "resolvedThisTurn": [string],
  "currentBestGuess": string,
  "wouldAskingChangeAnswer": boolean,
  "mode": "clarify" | "decide",
  "nextQuestion": string,
  "questionClosesId": string,
  "options": [{"label": "...", "implication": "..."}],
  "isComplete": boolean,
  "proposedBudget": integer
}

Field coherence:
- If isComplete is true: nextQuestion is "", questionClosesId is "", options is [], wouldAskingChangeAnswer is false, mode is "decide".
- If isComplete is false: nextQuestion, questionClosesId, and options must all be populated, and questionClosesId must match an id in openQuestions.
- resolvedThisTurn ids must have existed in the previous turn's openQuestions. On phase "initial", resolvedThisTurn is [].
- proposedBudget: on phase "initial" only, propose a budget 1-10 based on how many genuine ambiguities exist in the context. Sparse context with 1-2 gaps: propose 2-3. Rich context with 3-5 concerns: propose 4-6. Dense multi-stakeholder context: propose 7-10. On subsequent phases, set proposedBudget to 0 (field ignored after turn 0).

## Phase handling

PHASE "initial": turn 0. Seed openQuestions from gaps in the context. If intent is auto, the first question is always about which intent to use. If the context has three or more distinct issues, include a seed question about which issue to prioritise. resolvedThisTurn is []. isComplete is false unless context is genuinely unambiguous and currentBestGuess is already good. proposedBudget must be a sensible integer 1-10.

Otherwise: continue the diagnostic. Use the state provided to avoid re-asking and to maintain id continuity. proposedBudget must be 0.
`.trim();

  const buildClaudeSystemPrompt = (phase) => `${buildSystemPromptBody(phase)}

RESPONSE FORMAT: Respond with a single JSON object and nothing else. No prose, no markdown fences, no commentary.`;

  const buildGeminiSystemPrompt = (phase) => buildSystemPromptBody(phase);

  // ============================================================
  // Provider-specific API calls
  // ============================================================
  const callClaude = async (userPrompt, phase) => {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: selectedModel,
        max_tokens: 2000,
        system: buildClaudeSystemPrompt(phase),
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!response.ok) throw new Error(`Claude API failed: ${response.status}`);

    const data = await response.json();
    const text = data?.content?.[0]?.text;
    if (!text) throw new Error('Empty response from Claude.');

    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    return JSON.parse(cleaned);
  };

  const callGemini = async (userPrompt, phase) => {
    const apiKey = ""; // Canvas runtime injects
    const isPro = selectedModel.includes('pro');

    // Pro models handle responseSchema inconsistently; fall back to prompted JSON.
    const generationConfig = isPro
      ? {
          responseMimeType: 'application/json',
          temperature: 0.1
        }
      : {
          responseMimeType: 'application/json',
          temperature: 0.1,
          responseSchema: {
            type: 'OBJECT',
            properties: {
              overview: { type: 'STRING' },
              openQuestions: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: { id: { type: 'STRING' }, text: { type: 'STRING' } },
                  required: ['id', 'text']
                }
              },
              resolvedThisTurn: { type: 'ARRAY', items: { type: 'STRING' } },
              currentBestGuess: { type: 'STRING' },
              wouldAskingChangeAnswer: { type: 'BOOLEAN' },
              mode: { type: 'STRING', enum: ['clarify', 'decide'] },
              nextQuestion: { type: 'STRING' },
              questionClosesId: { type: 'STRING' },
              options: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: { label: { type: 'STRING' }, implication: { type: 'STRING' } },
                  required: ['label', 'implication']
                }
              },
              isComplete: { type: 'BOOLEAN' },
              proposedBudget: { type: 'INTEGER' }
            },
            required: ['overview', 'openQuestions', 'resolvedThisTurn', 'currentBestGuess', 'wouldAskingChangeAnswer', 'mode', 'nextQuestion', 'options', 'isComplete', 'proposedBudget']
          }
        };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: buildGeminiSystemPrompt(phase) }] },
          generationConfig
        })
      }
    );

    if (!response.ok) {
      if (response.status === 403) throw new Error('Access denied or restricted model.');
      if (response.status === 400) throw new Error(`Gemini rejected the request (400). The selected model may not support structured output. Try Gemini 2.5 Flash.`);
      throw new Error(`Gemini API failed: ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      const finishReason = data.candidates?.[0]?.finishReason;
      if (finishReason && finishReason !== 'STOP') {
        throw new Error(`Gemini halted: ${finishReason}. Try a different model.`);
      }
      throw new Error('Empty response from Gemini.');
    }

    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch (err) {
      throw new Error(`Gemini returned unparseable JSON. Model may not support this prompt. Try Gemini 2.5 Flash.`);
    }
  };

  // Unified call with backoff
  const callModel = async (userPrompt, phase) => {
    setIsLoading(true);
    setErrorMessage(null);
    const delays = [1000, 2000, 4000, 8000, 16000];
    const maxRetries = 5;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = provider === 'claude'
          ? await callClaude(userPrompt, phase)
          : await callGemini(userPrompt, phase);
        setIsLoading(false);
        return result;
      } catch (err) {
        if (attempt === maxRetries) {
          const hint = provider === 'claude'
            ? 'If running in Gemini Canvas, switch provider to Gemini. If running in Claude.ai Artifact, this should work.'
            : 'If running in Claude.ai Artifact, switch provider to Claude. If running in Gemini Canvas, this should work.';
          setErrorMessage(`${err.message || 'Engine unavailable.'} ${hint}`);
          setIsLoading(false);
          return null;
        }
        await new Promise(r => setTimeout(r, delays[attempt]));
      }
    }
  };

  // ============================================================
  // Client-side stop enforcement
  // ============================================================
  const applyTurnResult = (result, userAnswerText = null, isInitial = false) => {
    if (!result) return;

    setOverview(result.overview || overview);
    setCurrentBestGuess(result.currentBestGuess || '');
    setMode(result.mode || 'clarify');

    // On turn 0, capture the model's budget proposal and apply it (if user hasn't already overridden)
    if (isInitial && typeof result.proposedBudget === 'number' && result.proposedBudget >= 1 && result.proposedBudget <= 10) {
      setProposedBudget(result.proposedBudget);
      if (!budgetOverridden) {
        setQuestionBudget(result.proposedBudget);
      }
    }

    const resolvedIds = new Set(result.resolvedThisTurn || []);
    if (resolvedIds.size && userAnswerText) {
      const newlyResolved = openQuestions
        .filter(q => resolvedIds.has(q.id))
        .map(q => ({ ...q, answer: userAnswerText }));
      setResolved(prev => [...prev, ...newlyResolved]);
    }
    setOpenQuestions(result.openQuestions || []);

    const effectiveBudget = isInitial && typeof result.proposedBudget === 'number' && !budgetOverridden
      ? result.proposedBudget
      : QUESTION_BUDGET;
    const budgetExhausted = questionsAsked >= effectiveBudget;
    const nothingLeft = !result.openQuestions || result.openQuestions.length === 0;
    const notWorthAsking = result.wouldAskingChangeAnswer === false;
    const shouldStop = result.isComplete || nothingLeft || notWorthAsking || budgetExhausted;

    if (shouldStop) {
      setIsComplete(true);
      setCurrentOptions([]);
      return;
    }

    const q = (result.nextQuestion || '').trim();

    // Validate questionClosesId: must match an id in the openQuestions the model just returned.
    const openIds = new Set((result.openQuestions || []).map(oq => oq.id));
    const closesId = (result.questionClosesId || '').trim();
    const closesIdValid = closesId && openIds.has(closesId);
    if (!closesIdValid && closesId) {
      // Model emitted an id that doesn't exist in its own openQuestions. Likely a meta/framing question.
      console.warn(`[Diagnostic] questionClosesId "${closesId}" does not match any open question. Model may have asked a meta-question.`);
    }

    const seen = new Set();
    const cleanOpts = (result.options || []).filter(o => {
      if (!o.label || !o.implication) return false;
      const key = o.implication.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    setCurrentOptions(cleanOpts);
    setConversation(prev => [...prev, { role: 'assistant', text: q }]);
    setQuestionsAsked(n => n + 1);
  };

  // ============================================================
  // Turn handlers
  // ============================================================
  const initiate = async () => {
    if (!context.trim()) return;
    const result = await callModel(`Raw Context:\n${context}`, 'initial');
    if (result) {
      setStep('inquiry');
      applyTurnResult(result, null, true);
    }
  };

  const handleResponse = async (text) => {
    if (!text.trim() || isLoading) return;
    const newHistory = [...conversation, { role: 'user', text }];
    setConversation(newHistory);
    setCurrentInput('');
    setCurrentOptions([]);

    const stateBlob = {
      overview,
      openQuestions,
      resolvedSoFar: resolved.map(r => ({ q: r.text, a: r.answer })),
      previousBestGuess: currentBestGuess,
      questionsAsked,
      budget: QUESTION_BUDGET
    };

    const userPrompt = `CONTEXT:
${context}

CURRENT STATE:
${JSON.stringify(stateBlob, null, 2)}

CONVERSATION SO FAR:
${newHistory.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n')}

The user's latest answer is the last USER line. Apply the protocol and respond with the JSON object only.`;

    const result = await callModel(userPrompt, 'continue');
    applyTurnResult(result, text);
  };

  // ============================================================
  // Utilities
  // ============================================================
  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setContext(text);
    } catch (err) {
      console.warn('Clipboard failed', err);
    }
  };

  const loadSample = () => {
    setContext("PROJECT_ALPHA: Status Sync\nStakeholders: Operations Team\nStatus: Yellow\n\nNotes: The system migration is partially complete. Team reported unexpected latency in the primary data cluster. We are seeing intermittent connection resets during peak load. Need to determine if we proceed with the phase 2 rollout tomorrow or wait for the patch. Legal is still reviewing the updated service agreement for the vendor.");
  };

  const resetAll = () => {
    setStep('setup');
    setContext('');
    setConversation([]);
    setOverview('');
    setOpenQuestions([]);
    setResolved([]);
    setCurrentBestGuess('');
    setCurrentOptions([]);
    setMode('clarify');
    setIsComplete(false);
    setQuestionsAsked(0);
    setQuestionBudget(6);
    setProposedBudget(null);
    setBudgetOverridden(false);
    setErrorMessage(null);
  };

  const copyReport = () => {
    const report = [
      'EXECUTIVE INTELLIGENCE REPORT',
      '='.repeat(42),
      '',
      `[INTENT] ${intents.find(i => i.id === intent)?.name}`,
      '',
      '[OVERVIEW]',
      overview,
      '',
      '[RECOMMENDATION]',
      currentBestGuess,
      '',
      '[RESOLVED QUESTIONS]',
      ...resolved.map(r => `Q: ${r.text}\nA: ${r.answer}`),
      '',
      openQuestions.length ? '[STILL OPEN]' : '',
      ...openQuestions.map(q => `- ${q.text}`),
      '',
      `Questions asked: ${questionsAsked} / ${QUESTION_BUDGET}${proposedBudget && !budgetOverridden ? ` (budget proposed by model)` : budgetOverridden ? ` (budget overridden from proposed ${proposedBudget})` : ''}`,
      `Provider: ${provider} (${selectedModel})`
    ].join('\n');

    const ta = document.createElement('textarea');
    ta.value = report;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('copy failed', err);
    }
    document.body.removeChild(ta);
  };

  const budgetPct = Math.min(100, (questionsAsked / QUESTION_BUDGET) * 100);

  // Accent colour: High-contrast Tech Theme
  const accent = provider === 'claude'
    ? { 
        bg50: 'bg-amber-950/30', 
        bg500: 'bg-amber-500', 
        bg600: 'bg-amber-600', 
        bg700: 'hover:bg-amber-700', 
        border: 'border-amber-500/50', 
        borderLight: 'border-amber-900/50', 
        text: 'text-amber-400', 
        text600: 'text-amber-500', 
        text700: 'text-amber-600', 
        hover: 'hover:bg-amber-900/20', 
        focusBorder: 'focus:border-amber-500', 
        focusRing: 'focus:ring-amber-500/20', 
        optionBg: 'bg-amber-950/20', 
        optionHoverBg: 'hover:bg-amber-600', 
        optionHoverBorder: 'hover:border-amber-600', 
        optionLightText: 'group-hover:text-amber-50' 
      }
    : { 
        bg50: 'bg-cyan-950/30', 
        bg500: 'bg-cyan-500', 
        bg600: 'bg-cyan-600', 
        bg700: 'hover:bg-cyan-700', 
        border: 'border-cyan-500/50', 
        borderLight: 'border-cyan-900/50', 
        text: 'text-cyan-400', 
        text600: 'text-cyan-500', 
        text700: 'text-cyan-600', 
        hover: 'hover:bg-cyan-900/20', 
        focusBorder: 'focus:border-cyan-500', 
        focusRing: 'focus:ring-cyan-500/20', 
        optionBg: 'bg-cyan-950/20', 
        optionHoverBg: 'hover:bg-cyan-600', 
        optionHoverBorder: 'hover:border-cyan-600', 
        optionLightText: 'group-hover:text-cyan-50' 
      };

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 sm:p-8 font-mono text-zinc-300">
      <div className="max-w-4xl w-full bg-zinc-900/50 backdrop-blur-xl rounded-3xl shadow-2xl border border-zinc-800/60 flex flex-col overflow-hidden h-[850px] relative">

        {/* HEADER */}
        <header className="px-8 py-6 border-b border-zinc-800/60 flex items-center justify-between bg-zinc-900/80 backdrop-blur-md z-10 shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center text-white border border-zinc-700">
              <Terminal className={`w-6 h-6 ${accent.text}`} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tighter leading-none text-zinc-100 uppercase">DIAGNOSTIC_CORE_v2.5</h1>
              <div className="flex gap-3 mt-1.5 flex-wrap items-center">
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-950/30 border border-emerald-900/50 rounded">
                  <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-[8px] text-emerald-500/80 font-black tracking-widest uppercase">Uplink_Active</span>
                </div>
                <span className="px-2 py-0.5 bg-zinc-800 text-[8px] font-bold text-zinc-400 rounded uppercase tracking-widest flex items-center gap-1 border border-zinc-700">
                  <Cpu className="w-3 h-3" /> {currentModelInfo?.name}
                </span>
                {step === 'inquiry' && (
                  <>
                    <span className={`px-2 py-0.5 text-[8px] font-bold rounded uppercase tracking-widest flex items-center gap-1 border ${
                      mode === 'decide' ? 'bg-emerald-950/30 text-emerald-400 border-emerald-900/50' : `${accent.bg50} ${accent.text} ${accent.borderLight}`
                    }`}>
                      <Target className="w-3 h-3" /> {mode}_MODE
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDocs(true)}
              className="p-2 hover:bg-zinc-800 text-zinc-500 hover:text-zinc-100 rounded-lg transition-all border border-transparent hover:border-zinc-700"
              title="System Documentation"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
            <button
              onClick={resetAll}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800 text-zinc-500 hover:text-zinc-100 rounded-lg transition-all border border-transparent hover:border-zinc-700 font-black text-[9px] uppercase tracking-widest"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:block">Purge_State</span>
            </button>
          </div>
        </header>

        {step === 'inquiry' && (
          <div className="bg-zinc-900 border-b border-zinc-800 shrink-0">
            <div className="px-8 py-2 flex items-center gap-3">
              <button
                onClick={() => setBudgetEditOpen(v => !v)}
                className="flex items-center gap-1 text-zinc-600 hover:text-zinc-400 transition-colors"
                title="Adjust question budget"
              >
                <Gauge className="w-3.5 h-3.5" />
              </button>
              <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${budgetPct >= 80 ? 'bg-rose-500' : budgetPct >= 50 ? 'bg-amber-500' : accent.bg500}`}
                  style={{ width: `${budgetPct}%` }}
                />
              </div>
              <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">
                QUERY_LOAD: {questionsAsked} / {QUESTION_BUDGET}
              </span>
              {proposedBudget && !budgetOverridden && (
                <span className={`px-1.5 py-0.5 ${accent.bg50} ${accent.text600} text-[8px] font-black uppercase tracking-widest rounded border ${accent.borderLight}`}>
                  Proposed
                </span>
              )}
              {budgetOverridden && (
                <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[8px] font-black uppercase tracking-widest rounded border border-slate-200">
                  Custom
                </span>
              )}
              <button
                onClick={() => setBudgetEditOpen(v => !v)}
                className="text-[9px] font-bold text-slate-400 hover:text-slate-700 uppercase tracking-widest transition-colors"
              >
                {budgetEditOpen ? 'Close' : 'Edit'}
              </button>
            </div>
            {budgetEditOpen && (
              <div className="px-8 pb-3 pt-1 border-t border-slate-50">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">
                        Question budget
                      </label>
                      <div className="flex items-center gap-2">
                        {proposedBudget && (
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                            Model proposed {proposedBudget}
                          </span>
                        )}
                        <span className={`text-sm font-black ${accent.text700}`}>
                          {QUESTION_BUDGET}
                        </span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      step="1"
                      value={QUESTION_BUDGET}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setQuestionBudget(v);
                        setBudgetOverridden(v !== proposedBudget);
                      }}
                      className={`w-full h-1.5 bg-slate-100 rounded-full appearance-none cursor-pointer accent-slate-900`}
                      disabled={questionsAsked >= QUESTION_BUDGET}
                    />
                  </div>
                  {proposedBudget && budgetOverridden && (
                    <button
                      onClick={() => {
                        setQuestionBudget(proposedBudget);
                        setBudgetOverridden(false);
                      }}
                      className="text-[9px] font-bold text-slate-400 hover:text-slate-700 uppercase tracking-widest transition-colors shrink-0"
                    >
                      Restore proposed
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-2 leading-snug">
                  Ceiling on how many questions the agent may ask. Raise to keep digging, lower to force an earlier stop. Can be adjusted mid-run.
                </p>
              </div>
            )}
          </div>
        )}

        {/* BODY */}
        <div className="flex-1 overflow-y-auto bg-zinc-950/30 p-8">

          {errorMessage && (
            <div className="mb-6 p-5 bg-rose-950/30 border border-rose-900/50 rounded-2xl flex items-start gap-4">
              <AlertTriangle className="w-5 h-5 text-rose-500 mt-0.5 shrink-0" />
              <div className="space-y-1 flex-1">
                <h3 className="text-sm font-bold text-rose-200">SYSTEM_CRITICAL_ERR</h3>
                <p className="text-xs text-rose-400 font-medium leading-relaxed">{errorMessage}</p>
              </div>
              <button onClick={() => setErrorMessage(null)} className="ml-auto text-rose-700 hover:text-rose-500 shrink-0">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
          )}

          {step === 'setup' && (
            <div className="max-w-2xl mx-auto space-y-8 py-4">
              <div className="text-center space-y-3">
                <h2 className="text-3xl font-black text-zinc-100 tracking-tight uppercase">DIAGNOSTIC_INIT</h2>
                <p className="text-zinc-400 text-sm font-medium leading-relaxed">
                  Feed raw context into the buffer. The agent will propose a question budget and terminate when entropy is resolved.
                </p>
              </div>

              <div className="space-y-6">

                {/* Provider toggle */}
                <div className="space-y-3">
                  <label className="text-[10px] font-bold uppercase text-zinc-100 tracking-widest flex items-center gap-2 px-1">
                    <BrainCircuit className="w-3.5 h-3.5" /> SELECT_PROVIDER
                  </label>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(providerCatalog).map(([key, { label }]) => {
              const isClaude = key === 'claude';
              return (
                <button
                  key={key}
                  onClick={() => !isClaude && handleProviderChange(key)}
                  disabled={isClaude}
                  title={isClaude ? "Coming soon" : ""}
                  className={`p-3 rounded-xl border-2 font-bold text-xs transition-all ${
                    isClaude 
                      ? 'border-zinc-900 bg-zinc-950/20 text-zinc-700 cursor-not-allowed'
                      : provider === key
                        ? `${accent.border} ${accent.bg50} shadow-[0_0_15px_rgba(0,0,0,0.2)] ${accent.text}`
                        : 'border-zinc-800 bg-zinc-900/50 text-zinc-500 hover:border-zinc-700'
                  }`}
                >
                  {label.toUpperCase()} {isClaude && "(SOON)"}
                </button>
              );
            })}
          </div>
                </div>

                {/* Model */}
                <div className="space-y-3">
                  <label className="text-[10px] font-bold uppercase text-zinc-100 tracking-widest flex items-center gap-2 px-1">
                    <Cpu className="w-3.5 h-3.5" /> SELECT_ENGINE
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {currentModels.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setSelectedModel(m.id)}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                          selectedModel === m.id
                            ? `${accent.border} ${accent.bg50} shadow-lg`
                            : `border-zinc-800 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-800/50`
                        }`}
                      >
                        <div className="flex justify-between items-center mb-1 gap-2">
                          <span className={`text-[11px] font-bold ${selectedModel === m.id ? accent.text : 'text-zinc-300'}`}>
                            {m.name.toUpperCase()}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {m.recommended && (
                              <span className="px-1.5 py-0.5 bg-emerald-950/50 text-emerald-400 text-[8px] font-black uppercase tracking-widest rounded border border-emerald-900/50">
                                STABLE
                              </span>
                            )}
                            {selectedModel === m.id && <CheckCircle2 className={`w-3.5 h-3.5 ${accent.text}`} />}
                          </div>
                        </div>
                        <p className="text-[10px] font-medium text-zinc-500 leading-snug">{m.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Intent */}
                <div className="space-y-3">
                  <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest flex items-center gap-2 px-1">
                    <Compass className="w-3.5 h-3.5" /> SELECT_INTENT
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {intents.map((it) => (
                      <button
                        key={it.id}
                        onClick={() => setIntent(it.id)}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                          intent === it.id
                            ? `${accent.border} ${accent.bg50} shadow-lg`
                            : `border-zinc-800 bg-zinc-950/40 hover:border-zinc-700 hover:bg-zinc-900/50`
                        }`}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className={`text-[11px] font-bold ${intent === it.id ? accent.text : 'text-zinc-200'}`}>
                            {it.name.toUpperCase()}
                          </span>
                          {intent === it.id && <CheckCircle2 className={`w-3.5 h-3.5 ${accent.text}`} />}
                        </div>
                        <p className="text-[10px] font-medium text-zinc-500 leading-tight">{it.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest flex items-center gap-2">
                      <Clipboard className="w-3.5 h-3.5" /> RAW_CONTEXT_BUFFER
                    </label>
                    <div className="flex gap-4">
                      <button onClick={loadSample} className={`text-[10px] font-bold uppercase ${accent.text} hover:brightness-125 transition-all`}>
                        [LOAD_SAMPLE]
                      </button>
                      <button onClick={pasteFromClipboard} className="text-[10px] font-bold uppercase text-zinc-500 hover:text-zinc-300 transition-all">
                        [PASTE_CLIP]
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    placeholder="await input_stream..."
                    className={`w-full h-48 p-6 rounded-2xl bg-zinc-900/50 border-2 border-zinc-800 ${accent.focusBorder} focus:ring-0 text-xs font-medium text-zinc-300 transition-all resize-none shadow-inner placeholder:text-zinc-700 tracking-tight`}
                  />
                </div>

                <button
                  onClick={initiate}
                  disabled={!context.trim() || isLoading}
                  className="w-full py-5 bg-zinc-100 text-zinc-950 rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(255,255,255,0.05)] transition-all flex items-center justify-center gap-3"
                >
                  {isLoading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> SYSTEM_INITIALIZING...</>
                  ) : (
                    <>INITIALIZE_DIAGNOSTIC <Zap className="w-3.5 h-3.5 fill-current" /></>
                  )}
                </button>
              </div>
            </div>
          )}

          {step === 'inquiry' && (
            <div className="space-y-6 pb-4">

              {(overview || currentBestGuess) && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4 shadow-2xl">
                  {overview && (
                    <div className="relative group">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="text-[9px] font-black uppercase text-zinc-500 tracking-widest">SYSTEM_OVERVIEW</div>
                        <HelpCircle className="w-3 h-3 text-zinc-700 cursor-help" />
                        <div className="absolute left-0 -top-8 bg-zinc-800 text-[10px] text-zinc-300 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-zinc-700 whitespace-nowrap z-20">
                          Factual restatement with preserved hedges.
                        </div>
                      </div>
                      <p className="text-xs font-medium text-zinc-300 leading-relaxed border-l-2 border-zinc-800 pl-3">{overview}</p>
                    </div>
                  )}
                  {currentBestGuess && (
                    <div className="pt-4 border-t border-zinc-800/50 group relative">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`text-[9px] font-black uppercase ${accent.text} tracking-widest animate-pulse`}>CURRENT_BEST_GUESS</div>
                        <Info className="w-3 h-3 text-zinc-700 cursor-help" />
                        <div className="absolute left-0 -top-8 bg-zinc-800 text-[10px] text-zinc-300 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-zinc-700 whitespace-nowrap z-20">
                          Live output based on current entropy levels.
                        </div>
                      </div>
                      <p className="text-xs font-bold text-zinc-400 leading-relaxed italic whitespace-pre-wrap bg-zinc-950/50 p-3 rounded-lg border border-zinc-800/50">{currentBestGuess}</p>
                    </div>
                  )}
                </div>
              )}

              {(resolved.length > 0 || openQuestions.length > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {resolved.length > 0 && (
                    <div className="bg-emerald-950/20 border border-emerald-900/50 rounded-xl p-4 shadow-inner">
                      <div className="text-[8px] font-black uppercase text-emerald-500 tracking-[0.2em] mb-2">Resolved ({resolved.length})</div>
                      <ul className="space-y-1.5">
                        {resolved.map((r, i) => (
                          <li key={i} className="text-[10px] text-emerald-100/70 flex gap-2">
                            <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0 text-emerald-500" />
                            <span className="font-medium">{r.text}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {openQuestions.length > 0 && (
                    <div className="bg-amber-950/20 border border-amber-900/50 rounded-xl p-4 shadow-inner">
                      <div className="text-[8px] font-black uppercase text-amber-500 tracking-[0.2em] mb-2">Open ({openQuestions.length})</div>
                      <ul className="space-y-1.5">
                        {openQuestions.map((q, i) => (
                          <li key={i} className="text-[10px] text-amber-100/70 flex gap-2">
                            <Shield className="w-3 h-3 mt-0.5 shrink-0 text-amber-500" />
                            <span className="font-medium">{q.text}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {conversation.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-4 rounded-xl text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? `bg-zinc-100 text-zinc-950 font-bold border-2 border-white`
                      : `bg-zinc-900 text-zinc-300 border border-zinc-800 font-medium`
                  }`}>
                    <div className="text-[8px] uppercase tracking-tighter opacity-50 mb-1 font-black">
                      {msg.role === 'user' ? 'AUTH_USER' : 'AGENT_REASONING'}
                    </div>
                    {msg.text}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-zinc-900 border border-zinc-800 px-6 py-3 rounded-xl flex items-center gap-3 shadow-xl">
                    <Loader2 className={`w-3.5 h-3.5 animate-spin ${accent.text}`} />
                    <span className="text-[8px] font-black text-zinc-500 uppercase tracking-[0.2em]">System_Processing...</span>
                  </div>
                </div>
              )}

              {isComplete && !isLoading && (
                <div className="flex justify-center py-6">
                  <div className="bg-emerald-950/30 border border-emerald-900/50 px-6 py-4 rounded-xl flex items-center gap-3 text-emerald-400 shadow-2xl">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="font-black text-[10px] uppercase tracking-widest">Diagnostic_Protocol_Complete</span>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} className="h-4" />
            </div>
          )}
        </div>

        {step === 'inquiry' && (
          <div className="bg-zinc-900 border-t border-zinc-800 p-6 shrink-0 shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">

            {currentOptions.length > 0 && !isLoading && !isComplete && (
              <div className="flex flex-col gap-2 mb-4">
                <div className="text-[8px] font-black text-zinc-600 uppercase tracking-widest mb-1 ml-1">Select Input Branch:</div>
                {currentOptions.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => handleResponse(opt.label)}
                    className={`group text-left px-5 py-3 ${accent.optionBg} border ${accent.borderLight} rounded-xl ${accent.optionHoverBg} ${accent.optionHoverBorder} transition-all shadow-sm`}
                  >
                    <div className={`text-[10px] font-black ${accent.text} group-hover:text-white leading-tight`}>
                      {opt.label.toUpperCase()}
                    </div>
                    <div className={`text-[9px] font-medium text-zinc-500 ${accent.optionLightText} mt-1 leading-tight tracking-tight`}>
                      // {opt.implication}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {!isComplete ? (
              <div className="flex gap-3">
                <input
                  type="text"
                  value={currentInput}
                  onChange={(e) => setCurrentInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleResponse(currentInput)}
                  placeholder="await input_stream..."
                  className={`flex-1 p-4 bg-zinc-950 border border-zinc-800 rounded-xl text-xs focus:outline-none ${accent.focusBorder} focus:ring-1 ${accent.focusRing} font-medium text-zinc-100 placeholder:text-zinc-700`}
                  disabled={isLoading}
                />
                <button
                  onClick={() => handleResponse(currentInput)}
                  disabled={isLoading || !currentInput.trim()}
                  className="p-4 bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-all flex items-center justify-center shrink-0"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                <div className="flex items-center gap-3 px-2">
                  <Sparkles className={`w-5 h-5 ${accent.text}`} />
                  <div>
                    <div className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">Output_Status</div>
                    <div className="text-xs font-bold text-zinc-100">COMPILATION_COMPLETE</div>
                  </div>
                </div>
                <button
                  onClick={copyReport}
                  className={`px-6 py-3 text-[10px] font-black uppercase tracking-[0.15em] ${accent.bg600} text-white rounded-lg ${accent.bg700} transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98]`}
                >
                  {copied ? <CheckCircle2 className="w-4 h-4" /> : <Terminal className="w-4 h-4" />}
                  {copied ? 'COPIED_TO_CLIPBOARD' : 'EXECUTE_EXPORT'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* DOCUMENTATION MODAL */}
        {showDocs && (
          <div className="absolute inset-0 z-50 bg-zinc-950/90 backdrop-blur-md p-8 flex items-center justify-center">
            <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-black uppercase tracking-widest text-zinc-100">System_Specifications</h2>
                <button onClick={() => setShowDocs(false)} className="text-zinc-500 hover:text-zinc-100"><XCircle className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4 text-[11px] leading-relaxed text-zinc-400 font-medium">
                <p><strong className={accent.text}>[01] Diagnostic Protocol:</strong> Uses entropy-based elicitation. The agent identifies gaps in raw context and only asks questions where the answer would materially flip the recommendation branch.</p>
                <p><strong className={accent.text}>[02] Model Preservation:</strong> Specifically tuned to preserve user "hedges" (e.g., maybe, kind of). It will never upgrade your uncertainty into false confidence.</p>
                <p><strong className={accent.text}>[03] Showcase Mode:</strong> Running in Canvas/Claude? Paste code, hit preview. It leverages the host environment's injected keys for zero-config operation.</p>
              </div>
              <button 
                onClick={() => setShowDocs(false)}
                className="w-full py-3 bg-zinc-800 text-zinc-300 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-zinc-700 transition-all border border-zinc-700"
              >
                Close_Protocol
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}