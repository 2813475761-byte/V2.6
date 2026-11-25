'use strict';

function parseAgentJson(text) {
  if (!text) return null;
  let cleaned = String(text).trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) cleaned = fenced[1].trim();
  try {
    const value = JSON.parse(cleaned);
    return value && typeof value === 'object' ? value : null;
  } catch (error) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        const value = JSON.parse(cleaned.slice(start, end + 1));
        return value && typeof value === 'object' ? value : null;
      } catch (inner) {
        return null;
      }
    }
    return null;
  }
}

function normalizeResult(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const reply = String(raw.reply || raw.message || '').trim();
  const nextQuestion = String(raw.nextQuestion || raw.next_question || '').trim();
  if (!reply && !nextQuestion) return null;
  return {
    reply: reply || '我记下了，我们继续。',
    nextQuestion,
    draftPatch: raw.draftPatch || raw.draft_patch || null,
    planPatch: raw.planPatch || raw.plan_patch || null,
    interviewPatch: raw.interviewPatch || raw.interview_patch || null,
    progress: raw.progress && typeof raw.progress === 'object' ? raw.progress : {},
    score: raw.score && typeof raw.score === 'object' ? raw.score : null,
    suggestions: Array.isArray(raw.suggestions)
      ? raw.suggestions.map((item) => String(item).slice(0, 30)).slice(0, 4)
      : []
  };
}

module.exports = { parseAgentJson, normalizeResult };