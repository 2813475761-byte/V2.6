'use strict';

const DEFAULT_PROFILE = {
  schoolType: '',
  grade: '',
  major: '',
  targetJob: '',
  skills: []
};

const FIELD_LABELS = {
  'basic.name': '姓名',
  'basic.phone': '手机号',
  'basic.email': '邮箱',
  'basic.city': '意向城市',
  'basic.targetJob': '目标岗位',
  'education.school': '学校',
  'education.major': '专业',
  'education.degree': '学历',
  'education.startEnd': '在校时间',
  'education.gpa': 'GPA / 成绩',
  'skills': '专业技能',
  'projects.0.name': '项目名称',
  'projects.0.role': '项目角色',
  'projects.0.background': '项目背景',
  'projects.0.results': '项目成果',
  'internships.0.company': '实习公司',
  'internships.0.role': '实习岗位',
  'internships.0.results': '实习成果',
  'awards.0.name': '奖项 / 证书',
  'selfEvaluation': '自我评价'
};

function emptyResume() {
  return {
    basic: {
      name: '',
      gender: '',
      phone: '',
      email: '',
      city: '',
      targetJob: ''
    },
    education: {
      school: '',
      major: '',
      degree: '',
      startEnd: '',
      gpa: '',
      courses: []
    },
    skills: [],
    projects: [
      {
        name: '',
        role: '',
        period: '',
        background: '',
        actions: [],
        results: [],
        tech: []
      }
    ],
    internships: [],
    awards: [],
    selfEvaluation: ''
  };
}

function emptyProfile() {
  return { ...DEFAULT_PROFILE, skills: [] };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toSkill(input) {
  if (typeof input === 'string') {
    const name = input.trim();
    return name ? { name, level: '' } : null;
  }
  if (isPlainObject(input) && typeof input.name === 'string' && input.name.trim()) {
    return { name: input.name.trim(), level: String(input.level || '').trim() };
  }
  return null;
}

function mergeSkills(base, patch) {
  const map = new Map();
  for (const item of [...(base || []), ...(patch || [])]) {
    const skill = toSkill(item);
    if (!skill) continue;
    const previous = map.get(skill.name) || {};
    map.set(skill.name, { ...previous, ...skill, level: skill.level || previous.level || '' });
  }
  return [...map.values()];
}

function mergeValue(base, patch) {
  if (patch === undefined) return base;
  if (isPlainObject(base) && isPlainObject(patch)) {
    const result = { ...base };
    for (const key of Object.keys(patch)) {
      result[key] = mergeValue(base[key], patch[key]);
    }
    return result;
  }
  if (Array.isArray(base) && Array.isArray(patch)) {
    if (
      patch.length &&
      patch.every((item) => typeof item === 'string') &&
      base.every((item) => typeof item === 'string')
    ) {
      return [...new Set([...base, ...patch])];
    }
    const result = base.slice();
    patch.forEach((item, index) => {
      if (isPlainObject(item) && isPlainObject(result[index])) {
        result[index] = mergeValue(result[index], item);
      } else if (index < result.length) {
        if (item !== '' && item !== null && item !== undefined) result[index] = item;
      } else if (item !== '' && item !== null && item !== undefined) {
        result.push(item);
      }
    });
    return result;
  }
  if (patch === '' || patch === null) return base;
  return patch;
}

function mergeResume(base, patch) {
  const safeBase = normalizeResume(base);
  if (!isPlainObject(patch)) return safeBase;
  const cleaned = { ...patch };
  const skillsPatch = cleaned.skills;
  delete cleaned.skills;
  const merged = mergeValue(safeBase, cleaned);
  if (Array.isArray(skillsPatch)) {
    merged.skills = mergeSkills(safeBase.skills, skillsPatch);
  }
  return normalizeResume(merged);
}

function normalizeResume(input) {
  const fallback = emptyResume();
  if (!isPlainObject(input)) return fallback;
  const result = mergeValue(fallback, input);
  result.skills = mergeSkills([], Array.isArray(input.skills) ? input.skills : []);
  if (!Array.isArray(result.projects) || !result.projects.length) result.projects = fallback.projects;
  if (!Array.isArray(result.internships)) result.internships = [];
  if (!Array.isArray(result.awards)) result.awards = [];
  if (!Array.isArray(result.education.courses)) result.education.courses = [];
  return result;
}

function getByPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function isFilled(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim() !== '' && value.trim() !== '待补充';
  return value !== null && value !== undefined;
}

function missingFields(resume) {
  const safe = normalizeResume(resume);
  return Object.keys(FIELD_LABELS)
    .filter((path) => !isFilled(getByPath(safe, path)))
    .map((path) => ({ path, label: FIELD_LABELS[path] }));
}

function completeness(resume) {
  const total = Object.keys(FIELD_LABELS).length;
  const missing = missingFields(resume).length;
  return Math.round(((total - missing) / total) * 100);
}

function resumeToText(resume) {
  const safe = normalizeResume(resume);
  const skillText = safe.skills.map((s) => (s.level ? `${s.name}（${s.level}）` : s.name)).join('、');
  const projectText = safe.projects
    .filter((p) => p.name)
    .map((p) => `${p.name}（${p.role || '角色待补充'}）：${(p.actions || []).join('；')}；成果：${(p.results || []).join('；')}`)
    .join('\n');
  const internshipText = safe.internships
    .filter((i) => i.company)
    .map((i) => `${i.company} · ${i.role || '岗位待补充'}：${(i.actions || []).join('；')}；成果：${(i.results || []).join('；')}`)
    .join('\n');
  const awardText = safe.awards.filter((a) => a.name).map((a) => `${a.name} ${a.level || ''}`).join('、');
  return [
    `姓名：${safe.basic.name || '待补充'}；目标岗位：${safe.basic.targetJob || '待补充'}`,
    `教育：${safe.education.school || '待补充'} ${safe.education.major || ''} ${safe.education.degree || ''} ${safe.education.startEnd || ''}`,
    `技能：${skillText || '待补充'}`,
    `项目：\n${projectText || '待补充'}`,
    `实习：\n${internshipText || '暂无'}`,
    `奖项：${awardText || '暂无'}`,
    `自我评价：${safe.selfEvaluation || '待补充'}`
  ].join('\n');
}

module.exports = {
  DEFAULT_PROFILE,
  FIELD_LABELS,
  emptyResume,
  emptyProfile,
  normalizeResume,
  mergeResume,
  mergeSkills,
  missingFields,
  completeness,
  resumeToText,
  isFilled
};