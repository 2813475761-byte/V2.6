'use strict';

const crypto = require('crypto');
const repo = require('../repo');

const COOKIE_NAME = 'sid';
const MAX_AGE = 60 * 60 * 24 * 365;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseCookies(header) {
  const result = {};
  if (!header) return result;
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

function setSessionCookie(res, sessionId) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}`
  );
}

function sessionMiddleware(req, res, next) {
  try {
    const cookies = parseCookies(req.headers.cookie);
    let sessionId = cookies[COOKIE_NAME];
    let created = false;
    if (!UUID_RE.test(sessionId || '') || !repo.sessionExists(sessionId)) {
      sessionId = crypto.randomUUID();
      repo.ensureSession(sessionId);
      created = true;
    }
    req.sessionId = sessionId;
    if (created) setSessionCookie(res, sessionId);
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { sessionMiddleware, parseCookies, setSessionCookie, COOKIE_NAME };