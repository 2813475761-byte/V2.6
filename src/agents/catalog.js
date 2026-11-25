'use strict';

const fs = require('fs');
const config = require('../config');
const { levelScore, normalizeLevel } = require('./levels');

let cache = null;

const OFFICIAL_RESOURCE_URLS = {
  'MDN Web Docs': 'https://developer.mozilla.org/zh-CN/docs/Learn',
  'Vue 官方文档 / React 官方文档': 'https://cn.vuejs.org/guide/introduction.html',
  'Spring Boot 官方指南 / FastAPI 文档': 'https://spring.io/guides'
};

function resourceUrl(resource) {
  if (resource.url) return resource.url;
  const name = String(resource.name || '').trim();
  if (OFFICIAL_RESOURCE_URLS[name]) return OFFICIAL_RESOURCE_URLS[name];
  const keyword = name.replace(/\s*\/\s*/g, ' ').replace(/\s+/g, ' ').trim();
  return `https://search.bilibili.com/all?keyword=${encodeURIComponent(keyword)}`;
}

function withResourceUrls(job) {
  return {
    ...job,
    resources: (job.resources || []).map((item) => ({ ...item, url: resourceUrl(item) }))
  };
}

function loadCatalog() {
  if (!cache) {
    const raw = fs.readFileSync(config.jobCatalogPath, 'utf8');
    const parsed = JSON.parse(raw);
    cache = { ...parsed, jobs: (parsed.jobs || []).map(withResourceUrls) };
  }
  return cache;
}

function listJobs() {
  return loadCatalog().jobs.map((job) => ({
    id: job.id,
    name: job.name,
    aliases: job.aliases || [],
    majors: job.majors || [],
    summary: job.summary || '',
    skills: job.skills || [],
    projects: job.projects || [],
    interviewFocus: job.interviewFocus || []
  }));
}

function jobDetail(id) {
  const target = normalizeText(id);
  const job = loadCatalog().jobs.find(
    (item) => normalizeText(item.id) === target || normalizeText(item.name) === target
  );
  if (!job) return null;
  return {
    id: job.id,
    name: job.name,
    aliases: job.aliases || [],
    majors: job.majors || [],
    summary: job.summary || '',
    skills: job.skills || [],
    projects: job.projects || [],
    interviewFocus: job.interviewFocus || [],
    resources: job.resources || []
  };
}

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, '');
}

function findJob(query) {
  if (!query) return null;
  const target = normalizeText(query);
  const jobs = loadCatalog().jobs;
  let best = null;
  let bestScore = 0;
  for (const job of jobs) {
    const names = [job.id, job.name, ...(job.aliases || [])].map(normalizeText);
    for (const name of names) {
      if (!name) continue;
      let score = 0;
      if (name === target) score = 100;
      else if (target.includes(name) || name.includes(target)) score = name.length >= 2 ? 60 : 0;
      if (score > bestScore) {
        best = job;
        bestScore = score;
      }
    }
  }
  return best;
}

function findJobsByMajor(major) {
  const target = normalizeText(major);
  if (!target) return [];
  return loadCatalog().jobs.filter((job) =>
    (job.majors || []).some((item) => {
      const name = normalizeText(item);
      return name && (target.includes(name) || name.includes(target));
    })
  );
}

function recommendJob(profile = {}) {
  const job = findJob(profile.targetJob);
  if (job) return job;
  const byMajor = findJobsByMajor(profile.major);
  if (byMajor.length) return byMajor[0];
  return loadCatalog().jobs[0];
}

function skillKey(name) {
  return normalizeText(name);
}

function profileSkills(profile = {}) {
  return (profile.skills || [])
    .map((skill) => {
      if (!skill) return null;
      const name = typeof skill === 'string' ? skill : skill.name;
      if (!name || typeof name !== 'string' || !name.trim()) return null;
      const level = typeof skill === 'string' ? '' : skill.level;
      return { name: name.trim(), level: normalizeLevel(level) };
    })
    .filter(Boolean);
}

function diagnosis(profile = {}, job = null) {
  const target = job || recommendJob(profile);
  const owned = profileSkills(profile);
  const dimensions = target.skills.map((skill) => {
    const matched = owned.find((item) => isSkillMatched([skillKey(item.name)], skill.name));
    const current = matched ? matched.level || '了解' : '未接触';
    const currentScore = levelScore(current);
    const targetScore = levelScore(skill.level) || 100;
    const gap = Math.max(0, targetScore - currentScore);
    return {
      name: skill.name,
      target: skill.level,
      current,
      gap,
      advice:
        gap > 0
          ? `当前「${current}」→ 目标「${skill.level}」，建议优先补齐：${skill.name}。`
          : '可在简历中用项目或作品证明这项能力。'
    };
  });
  const earned = dimensions.reduce((sum, item) => sum + levelScore(item.current), 0);
  const required = dimensions.reduce((sum, item) => sum + (levelScore(item.target) || 100), 0);
  const matchScore = Math.min(100, Math.round((earned / Math.max(1, required)) * 100));
  const missing = dimensions.filter((item) => item.gap > 0).sort((a, b) => b.gap - a.gap);
  return {
    job: target,
    dimensions,
    matchScore,
    gapSummary: missing.length
      ? `距离「${target.name}」还差 ${missing.length} 项能力，优先补齐：${missing.slice(0, 3).map((i) => i.name).join('、')}。`
      : `已覆盖「${target.name}」的核心能力要求，接下来重点是把能力写进简历并用项目佐证。`,
    missing
  };
}

function isSkillMatched(owned, skillName) {
  const key = normalizeText(skillName);
  if (!key) return false;
  return owned.some((item) => {
    if (!item) return false;
    if (item.includes(key) || key.includes(item)) return true;
    return key
      .split(/[\/、,，]/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2)
      .some((part) => item.includes(part));
  });
}

function analyzeJobs(profile = {}) {
  const major = normalizeText(profile.major);
  const owned = profileSkills(profile)
    .map((item) => normalizeText(item.name))
    .filter(Boolean);
  const jobs = loadCatalog().jobs;

  const items = jobs.map((job) => {
    const majors = job.majors || [];
    const majorHit = major
      ? majors.find((item) => {
          const name = normalizeText(item);
          return name && (major.includes(name) || name.includes(major));
        })
      : '';

    const skills = (job.skills || []).map((skill) => ({
      name: skill.name,
      level: skill.level || '',
      weight: Number(skill.weight) || 2,
      hit: isSkillMatched(owned, skill.name)
    }));
    const matched = skills.filter((skill) => skill.hit);
    const missing = skills.filter((skill) => !skill.hit);
    const totalWeight = skills.reduce((sum, skill) => sum + skill.weight, 0) || 1;
    const matchedWeight = matched.reduce((sum, skill) => sum + skill.weight, 0);
    const skillScore = Math.round((matchedWeight / totalWeight) * 100);
    const majorScore = majorHit ? 100 : major ? 35 : 55;
    const score = Math.round(owned.length ? majorScore * 0.45 + skillScore * 0.55 : majorScore * 0.6 + 32);

    const reasons = [];
    if (majorHit) reasons.push(`专业对口：${majorHit}`);
    else if (major) reasons.push('专业非直接对口，可通过项目经历补足');
    if (matched.length) reasons.push(`已具备 ${matched.length}/${skills.length} 项核心能力`);
    if (missing.length) reasons.push(`优先补齐：${missing.slice(0, 2).map((skill) => skill.name).join('、')}`);

    return {
      id: job.id,
      name: job.name,
      summary: job.summary || '',
      score: Math.max(0, Math.min(100, score)),
      majorHit: Boolean(majorHit),
      matchedSkills: matched.map((skill) => skill.name),
      missingSkills: missing.map((skill) => skill.name),
      reasons
    };
  });

  return items.sort((a, b) => b.score - a.score).slice(0, 5);
}

module.exports = {
  loadCatalog,
  listJobs,
  jobDetail,
  findJob,
  findJobsByMajor,
  recommendJob,
  diagnosis,
  profileSkills,
  analyzeJobs
};