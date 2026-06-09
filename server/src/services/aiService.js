'use strict';

const { getNimClient, NIM_MODELS, NIM_FAST_MODELS, SYSTEM_PROMPT, isRetriable } = require('./nimClient');

/**
 * Run a chat completion, trying each model in order and falling through on
 * retriable errors (rate-limit, model-gone/EOL, not-found, 5xx).
 */
async function completeWithFallback({ messages, max_tokens, temperature }) {
  const client = getNimClient();
  let lastErr = null;
  for (const model of NIM_MODELS) {
    try {
      const response = await client.chat.completions.create({
        model,
        max_tokens,
        temperature,
        messages,
      });
      const content = response.choices?.[0]?.message?.content;
      if (content && content.trim()) return content.trim();
      lastErr = new Error(`Model ${model} returned no content`);
    } catch (err) {
      lastErr = err;
      const status = err.status || err.response?.status;
      if (status === 401 || status === 403) throw err; // key problem — stop
      if (!isRetriable(status)) throw err;
      // otherwise: try the next model
    }
  }
  throw lastErr || new Error('All AI models failed');
}

/**
 * Open a streaming chat completion, trying each model until one starts.
 */
async function streamWithFallback({ messages, max_tokens, temperature, models = NIM_MODELS }) {
  const client = getNimClient();
  let lastErr = null;
  for (const model of models) {
    try {
      return await client.chat.completions.create({
        model,
        max_tokens,
        temperature,
        messages,
        stream: true,
      });
    } catch (err) {
      lastErr = err;
      const status = err.status || err.response?.status;
      if (status === 401 || status === 403) throw err;
      if (!isRetriable(status)) throw err;
    }
  }
  throw lastErr || new Error('All AI models failed');
}

/**
 * Generate the full intelligence profile for one attachee. Returns parsed JSON.
 */
async function generateAttacheeProfile(attacheeContext) {
  const prompt = `You are producing a DETAILED, comprehensive attachee intelligence profile for a supervisor to make quality assessments. Be thorough and specific — cite the actual numbers from the data (attendance counts, percentages, arrival times, streaks, trends) in your reasoning. Longer, evidence-backed assessments are strongly preferred over short ones.

ATTACHEE DATA:
${attacheeContext}

Respond ONLY with a single valid JSON object — no markdown fences, no extra text, no preamble. Use this EXACT structure:
{
  "summary": "A rich 4-6 sentence narrative overall assessment of this attachee, weaving in concrete figures from the data.",
  "overall_rating": "one of: Excellent | Strong | Developing | Needs Support",
  "engagement_score": 0-100,
  "headline": "One punchy sentence capturing who this attachee is.",
  "competencies": {
    "Attendance": 0-100,
    "Punctuality": 0-100,
    "Consistency": 0-100,
    "Engagement": 0-100,
    "Task Performance": 0-100,
    "Initiative": 0-100
  },
  "strengths": ["5 to 7 specific, evidence-backed strengths, each citing data"],
  "weaknesses": ["3 to 5 specific growth areas, each grounded in the data"],
  "behavioral_patterns": ["4 to 6 observed patterns (punctuality, rhythm, consistency, day-of-week tendencies, trend)"],
  "attendance_assessment": "A detailed paragraph (4-6 sentences) analysing attendance volume, consistency, punctuality and trend, citing the numbers.",
  "punctuality": "A 1-2 sentence assessment of punctuality grounded in arrival-time figures.",
  "consistency": "A 1-2 sentence assessment of consistency grounded in streak/weeks/trend figures.",
  "work_themes": ["themes/skills inferred from the reported 'tasks completed' notes; empty array if none were recorded"],
  "skill_tags": ["6 to 10 skill tags inferred cautiously from attendance reliability, reported work, and programme context"],
  "career_paths": [
    {
      "title": "Career Path Title (Kenyan tech/creative ecosystem where relevant)",
      "confidence": 0-100,
      "reasoning": "2-3 sentences on why this fits THIS attachee specifically, referencing their data.",
      "next_steps": ["3 to 4 concrete next steps"],
      "relevant_skills": ["2 to 4 skills that support this path"]
    }
  ],
  "recommendations": ["4 to 6 concrete, actionable recommendations for the supervisor"],
  "risk_flags": ["any concerns e.g. 'Declining attendance over the last two weeks'; use [] if none"]
}

Rules:
- Ground EVERY claim in the provided data. Cite specific numbers where possible. Do NOT invent submissions, grades, or task outcomes that are not shown.
- competencies: ALWAYS include this object with ALL SIX keys exactly as named (Attendance, Punctuality, Consistency, Engagement, Task Performance, Initiative). Each value MUST be a plain integer from 0 to 100 (e.g. 82) — never a string, percentage sign, range, or null. Use 50 when a dimension genuinely cannot be judged from the data. These scores power a radar chart, so keep them consistent with the strengths/weaknesses narrative — high scores are strengths, low scores are growth areas.
- career_paths: exactly 3, ordered by confidence descending.
- If data is thin, say so honestly in the relevant fields and keep confidence modest — but still fill every field.
- Return ONLY the JSON object.`;

  const raw = await completeWithFallback({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    max_tokens: 4000,
    temperature: 0.5,
  });

  // Strip markdown fences and isolate the JSON object if the model adds prose.
  let clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  const first = clean.indexOf('{');
  const last = clean.lastIndexOf('}');
  if (first > 0 || last < clean.length - 1) clean = clean.slice(first, last + 1);
  return JSON.parse(clean);
}

/**
 * Generate a narrative paragraph block for a progress or completion report.
 */
async function generateReportNarrative(attacheeContext, reportType) {
  return completeWithFallback({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildReportPrompt(attacheeContext, reportType) },
    ],
    max_tokens: 1200,
    temperature: 0.6,
  });
}

/**
 * Build the user prompt for a progress/completion report. Shared by the
 * streaming and non-streaming generators so both produce identical output.
 */
function buildReportPrompt(attacheeContext, reportType) {
  const isCompletion = reportType === 'completion';
  return `Based on the following attachee data, write a professional ${isCompletion ? 'attachment completion letter narrative' : 'mid-attachment progress report'}.

ATTACHEE DATA:
${attacheeContext}

${isCompletion
  ? `Write exactly 3 paragraphs:
1. Introduction: confirm completion of attachment, mention department and approximate duration
2. Performance summary: key strengths demonstrated, attendance reliability
3. Closing commendation: their contribution to the department and a recommendation statement`
  : `Write exactly 3 paragraphs:
1. Progress to date: attendance performance so far
2. Identified strengths and growth areas based on the available data
3. Recommendations for the remainder of the attachment period`}

Rules:
- Formal, professional English appropriate for a Kenyan NGO document.
- Only reference facts present in the data — do NOT invent details.
- Use the attachee's actual name throughout.
- Output body paragraphs only — no salutation, no sign-off, no headers.`;
}

/**
 * Streaming variant of the report generator. Calls onChunk(text) for each
 * streamed token and returns the full narrative.
 */
async function streamReportNarrative({ attacheeContext, reportType, onChunk }) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildReportPrompt(attacheeContext, reportType) },
  ];

  const stream = await streamWithFallback({
    messages,
    max_tokens: 1200,
    temperature: 0.6,
  });

  let fullText = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || '';
    if (delta) {
      fullText += delta;
      onChunk(delta);
    }
  }
  return fullText;
}

/**
 * Supervisor AI assistant — streaming.
 * Calls onChunk(text) for each streamed token, returns the full response.
 */
async function streamSupervisorAnswer({ question, departmentContext, chatHistory, onChunk }) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...chatHistory.slice(-10).map((m) => ({ role: m.role, content: m.content })),
    {
      role: 'user',
      content: `DEPARTMENT CONTEXT:\n${departmentContext}\n\nQUESTION: ${question}`,
    },
  ];

  const stream = await streamWithFallback({
    messages,
    max_tokens: 600,
    temperature: 0.6,
    models: NIM_FAST_MODELS,
  });

  let fullText = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || '';
    if (delta) {
      fullText += delta;
      onChunk(delta);
    }
  }
  return fullText;
}

module.exports = {
  generateAttacheeProfile,
  generateReportNarrative,
  streamReportNarrative,
  streamSupervisorAnswer,
};
