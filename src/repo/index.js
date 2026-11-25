'use strict';

const crypto = require('crypto');
const { getDb } = require('./db');
const { emptyProfile, emptyResume, normalizeResume } = require('./resume');

function now() {
  return new Date().toISOString();
}

function parseJSON(text, fallback) {
  try {
    const value = JSON.parse(text);
    return value === null || value === undefined ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

function normalizeSkill(skill) {
  if (typeof skill === 'string') {
    const name = skill.trim();
    return name ? { name, level: '' } : null;
  }
  if (skill && typeof skill === 'object' && typeof skill.name === 'string' && skill.name.trim()) {
    return { name: skill.name.trim(), level: String(skill.level || '').trim() };
  }
  return null;
}

function ensureSession(sessionId) {
  getDb()
    .prepare('INSERT OR IGNORE INTO sessions(id, created_at) VALUES (?, ?)')
    .run(sessionId, now());
  return sessionId;
}

function sessionExists(sessionId) {
  const row = getDb().prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
  return Boolean(row);
}

function getProfile(sessionId) {
  const row = getDb().prepare('SELECT * FROM profiles WHERE session_id = ?').get(sessionId);
  if (!row) return emptyProfile();
  const skills = parseJSON(row.skills, []);
  return {
    schoolType: row.school_type || '',
    grade: row.grade || '',
    major: row.major || '',
    targetJob: row.target_job || '',
    skills: Array.isArray(skills) ? skills.map(normalizeSkill).filter(Boolean) : []
  };
}

function saveProfile(sessionId, input) {
  const profile = { ...emptyProfile(), ...(input || {}) };
  const skills = (Array.isArray(profile.skills) ? profile.skills : [])
    .map(normalizeSkill)
    .filter(Boolean);
  getDb()
    .prepare(
      `INSERT INTO profiles(session_id, school_type, grade, major, target_job, skills, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET
         school_type = excluded.school_type,
         grade = excluded.grade,
         major = excluded.major,
         target_job = excluded.target_job,
         skills = excluded.skills,
         updated_at = excluded.updated_at`
    )
    .run(
      sessionId,
      String(profile.schoolType || ''),
      String(profile.grade || ''),
      String(profile.major || ''),
      String(profile.targetJob || ''),
      JSON.stringify(skills),
      now()
    );
  return getProfile(sessionId);
}

function addMessage(sessionId, agent, role, content, meta = {}) {
  const info = getDb()
    .prepare(
      'INSERT INTO messages(session_id, agent, role, content, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(sessionId, agent, role, String(content || ''), JSON.stringify(meta || {}), now());
  return Number(info.lastInsertRowid);
}

function listMessages(sessionId, agent, limit = 40) {
  const rows = getDb()
    .prepare('SELECT * FROM messages WHERE session_id = ? AND agent = ? ORDER BY id DESC LIMIT ?')
    .all(sessionId, agent, Math.max(1, Number(limit) || 40))
    .reverse();
  return rows.map((row) => ({
    id: row.id,
    agent: row.agent,
    role: row.role,
    content: row.content,
    meta: parseJSON(row.meta, {}),
    createdAt: row.created_at
  }));
}

function countMessages(sessionId, agent, role) {
  const row = role
    ? getDb()
        .prepare('SELECT COUNT(*) AS total FROM messages WHERE session_id = ? AND agent = ? AND role = ?')
        .get(sessionId, agent, role)
    : getDb()
        .prepare('SELECT COUNT(*) AS total FROM messages WHERE session_id = ? AND agent = ?')
        .get(sessionId, agent);
  return Number(row ? row.total : 0);
}

function listAllMessages(sessionId, limit = 200) {
  const rows = getDb()
    .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT ?')
    .all(sessionId, Math.max(1, Number(limit) || 200))
    .reverse();
  return rows.map((row) => ({
    id: row.id,
    agent: row.agent,
    role: row.role,
    content: row.content,
    meta: parseJSON(row.meta, {}),
    createdAt: row.created_at
  }));
}

function getLatestResume(sessionId) {
  const row = getDb()
    .prepare('SELECT version, json, updated_at FROM resumes WHERE session_id = ? ORDER BY version DESC LIMIT 1')
    .get(sessionId);
  if (!row) return { version: 0, resume: emptyResume(), updatedAt: null };
  return {
    version: Number(row.version),
    resume: normalizeResume(parseJSON(row.json, {})),
    updatedAt: row.updated_at
  };
}

function listResumeVersions(sessionId, limit = 20) {
  return getDb()
    .prepare('SELECT version, updated_at FROM resumes WHERE session_id = ? ORDER BY version DESC LIMIT ?')
    .all(sessionId, Math.max(1, Number(limit) || 20))
    .map((row) => ({ version: Number(row.version), updatedAt: row.updated_at }));
}

function saveResume(sessionId, resume) {
  const latest = getDb()
    .prepare('SELECT MAX(version) AS version FROM resumes WHERE session_id = ?')
    .get(sessionId);
  const version = Number(latest && latest.version ? latest.version : 0) + 1;
  const normalized = normalizeResume(resume);
  getDb()
    .prepare('INSERT INTO resumes(session_id, version, json, updated_at) VALUES (?, ?, ?, ?)')
    .run(sessionId, version, JSON.stringify(normalized), now());
  return { version, resume: normalized };
}

function getPlan(sessionId) {
  const row = getDb().prepare('SELECT json, updated_at FROM plans WHERE session_id = ?').get(sessionId);
  if (!row) return null;
  const plan = parseJSON(row.json, null);
  return plan ? { ...plan, updatedAt: row.updated_at } : null;
}

function savePlan(sessionId, plan) {
  getDb()
    .prepare(
      `INSERT INTO plans(session_id, json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`
    )
    .run(sessionId, JSON.stringify(plan || {}), now());
  return getPlan(sessionId);
}

function createInterview(sessionId, targetJob) {
  const data = {
    id: crypto.randomUUID(),
    status: 'active',
    targetJob: targetJob || '',
    rounds: [],
    score: null,
    createdAt: now()
  };
  getDb()
    .prepare('INSERT INTO interviews(id, session_id, status, json, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(data.id, sessionId, 'active', JSON.stringify(data), data.createdAt);
  return data;
}

function scoreFromRow(row, json) {
  if (json && json.score !== undefined && json.score !== null) return json.score;
  if (row.score === null || row.score === undefined) return null;
  return Number(row.score);
}

function getInterview(id) {
  const row = getDb().prepare('SELECT * FROM interviews WHERE id = ?').get(id);
  if (!row) return null;
  const json = parseJSON(row.json, {});
  return {
    ...json,
    id: row.id,
    status: row.status,
    score: scoreFromRow(row, json),
    createdAt: row.created_at,
    finishedAt: row.finished_at
  };
}

function getActiveInterview(sessionId) {
  const row = getDb()
    .prepare(
      "SELECT * FROM interviews WHERE session_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1"
    )
    .get(sessionId);
  if (!row) return null;
  const json = parseJSON(row.json, {});
  return {
    ...json,
    id: row.id,
    status: row.status,
    score: scoreFromRow(row, json),
    createdAt: row.created_at,
    finishedAt: row.finished_at
  };
}

function getLatestInterview(sessionId) {
  const row = getDb()
    .prepare('SELECT * FROM interviews WHERE session_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(sessionId);
  if (!row) return null;
  const json = parseJSON(row.json, {});
  return {
    ...json,
    id: row.id,
    status: row.status,
    score: scoreFromRow(row, json),
    createdAt: row.created_at,
    finishedAt: row.finished_at
  };
}

function updateInterview(id, data, options = {}) {
  const current = getInterview(id);
  if (!current) return null;
  const merged = { ...current, ...data };
  const nextStatus = options.status || merged.status || 'active';
  const jsonScore = Object.prototype.hasOwnProperty.call(data, 'score') ? data.score : current.score;
  let columnScore = options.score;
  if (columnScore === undefined) {
    columnScore = jsonScore && typeof jsonScore === 'object' ? jsonScore.overall : jsonScore;
  }
  const payload = { ...merged, status: nextStatus, score: jsonScore === undefined ? null : jsonScore };
  getDb()
    .prepare('UPDATE interviews SET status = ?, json = ?, score = ?, finished_at = ? WHERE id = ?')
    .run(
      nextStatus,
      JSON.stringify(payload),
      columnScore === undefined || columnScore === null ? null : Number(columnScore),
      nextStatus === 'finished' ? now() : null,
      id
    );
  return getInterview(id);
}

function finishInterview(id, data, overallScore) {
  return updateInterview(id, { ...data, status: 'finished' }, { status: 'finished', score: overallScore });
}

function addFeedback(sessionId, rating, comment) {
  const info = getDb()
    .prepare('INSERT INTO feedback(session_id, rating, comment, created_at) VALUES (?, ?, ?, ?)')
    .run(sessionId || null, Number(rating), String(comment || '').slice(0, 1000), now());
  return Number(info.lastInsertRowid);
}

function getStats() {
  const db = getDb();
  const one = (sql, ...args) => {
    const row = db.prepare(sql).get(...args);
    return row ? Number(Object.values(row)[0]) : 0;
  };
  return {
    sessions: one('SELECT COUNT(*) FROM sessions'),
    profiles: one('SELECT COUNT(*) FROM profiles'),
    messages: one('SELECT COUNT(*) FROM messages'),
    resumes: one('SELECT COUNT(DISTINCT session_id) FROM resumes'),
    plans: one('SELECT COUNT(*) FROM plans'),
    interviews: one('SELECT COUNT(*) FROM interviews'),
    finishedInterviews: one("SELECT COUNT(*) FROM interviews WHERE status = 'finished'"),
    feedback: one('SELECT COUNT(*) FROM feedback'),
    averageRating: (() => {
      const row = db.prepare('SELECT AVG(rating) AS avg FROM feedback').get();
      return row && row.avg ? Number(row.avg.toFixed(2)) : 0;
    })()
  };
}

module.exports = {
  now,
  parseJSON,
  ensureSession,
  sessionExists,
  getProfile,
  saveProfile,
  addMessage,
  listMessages,
  listAllMessages,
  countMessages,
  getLatestResume,
  listResumeVersions,
  saveResume,
  getPlan,
  savePlan,
  createInterview,
  getInterview,
  getActiveInterview,
  getLatestInterview,
  updateInterview,
  finishInterview,
  addFeedback,
  getStats
};