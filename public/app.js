'use strict';

const AGENTS = {
  growth: {
    title: '成长教练',
    emptyTitle: '从了解自己开始',
    emptyText: '告诉我你的年级、专业和目标岗位，我会一次问一个问题，帮你把能力差距和提升计划理清楚。'
  },
  resume: {
    title: '简历顾问',
    emptyTitle: '把经历变成可投递的简历',
    emptyText: '我会按基本信息、教育、项目、实习、技能、奖项的顺序逐项追问，右侧实时生成可编辑草稿。'
  },
  interview: {
    title: '模拟面试官',
    emptyTitle: '用最新简历做一次真实模拟',
    emptyText: '我会读取你最新的简历草稿出题，并根据你的回答继续追问，结束后给出分维度评分。'
  }
};

const ALL_MODES = ['growth', 'resume', 'interview'];
const SCHOOL_GRADES = {
  高校: ['大一', '大二', '大三', '大四'],
  高职: ['大一', '大二', '大三']
};
const GRADE_MODES = {
  大一: ['growth', 'interview'],
  大二: ['growth', 'interview'],
  大三: ['resume', 'interview'],
  大四: ['resume', 'interview'],
  已毕业: ['resume', 'interview']
};
const STORAGE_KEY = 'career-compass-v2';

const app = {
  mode: 'growth',
  meta: null,
  state: null,
  busy: false,
  draft: null,
  draftDirty: false,
  saveTimer: null,
  feedbackScore: 0,
  toastTimer: null,
  analysis: null,
  jobTarget: null,
  pendingMessage: null,
  panelSig: '',
  progress: { resume: null, plan: null }
};

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function linkify(value) {
  return escapeHtml(value).replace(
    /(https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&()*+,;=%]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function setPath(object, path, value) {
  const keys = path.split('.');
  let cursor = object;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i];
    if (cursor[key] === null || cursor[key] === undefined) {
      cursor[key] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    }
    cursor = cursor[key];
  }
  cursor[keys[keys.length - 1]] = value;
}

async function api(path, options = {}) {
  const config = { headers: { 'Content-Type': 'application/json' }, ...options };
  if (config.body && typeof config.body !== 'string') {
    config.body = JSON.stringify(config.body);
  }
  const response = await fetch(path, config);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '请求失败');
  return data;
}

function toast(message, duration = 2800) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(app.toastTimer);
  app.toastTimer = setTimeout(() => element.classList.remove('show'), duration);
}

function loadLocal() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null') || {};
  } catch (error) {
    return {};
  }
}

function saveLocal(patch) {
  const next = { ...loadLocal(), ...patch };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    /* 本地存储不可用时不影响主流程 */
  }
}

function isEmptyProfile(profile) {
  return (
    !profile ||
    (!profile.schoolType &&
      !profile.grade &&
      !profile.major &&
      !profile.targetJob &&
      !(profile.skills || []).length)
  );
}

function availableModes() {
  const profile = (app.state && app.state.profile) || {};
  return GRADE_MODES[profile.grade] || ALL_MODES;
}

function normalizeMode() {
  const modes = availableModes();
  if (!modes.includes(app.mode)) {
    app.mode = modes[0];
  }
}

function updateComposer() {
  const input = $('#input');
  const button = $('#sendBtn');
  input.disabled = app.busy;
  button.disabled = app.busy;
  button.textContent = app.busy ? '思考中' : '发送';
}

function renderAll() {
  normalizeMode();
  renderTabs();
  renderBanner();
  renderAgentHead();
  renderProfile();
  renderJobSkills();
  renderJobBackdrop();
  renderProgress();
  renderMessages();
  renderSuggestions();
  renderResultPanel();
  syncDraft();
}

const CODE_TEXT = [
  'const app = init()',
  'useEffect(() =&gt; {',
  '  return jsx',
  'render(&lt;App /&gt;)',
  '}) // ready',
  'type Job = { id }'
];

function codeColumn(offset) {
  const lines = CODE_TEXT.slice(offset).concat(CODE_TEXT.slice(0, offset));
  const body = lines.map((line) => `<span>${line}</span>`).join('');
  return `<div class="code-col">${body}${body}</div>`;
}

function codeScene() {
  return `<div class="fx-code">${[0, 4].map((offset) => codeColumn(offset)).join('')}</div>`;
}

function gearSvg(cls) {
  let teeth = '';
  for (let i = 0; i < 8; i += 1) {
    teeth += `<rect x="47" y="3" width="6" height="12" rx="2" transform="rotate(${i * 45} 50 50)"/>`;
  }
  return `<svg class="${cls}" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4"><circle cx="50" cy="50" r="32"/><circle cx="50" cy="50" r="12"/><g fill="currentColor" stroke="none">${teeth}</g></svg>`;
}

const JOB_FX = {
  frontend: codeScene(),
  backend: '<div class="fx-servers"><i></i><i></i></div>',
  testing: '<div class="fx-check"><i class="ring"></i><i class="tick"></i></div>',
  product: '<div class="fx-flow"><i></i><i></i><i></i></div>',
  operations: '<div class="fx-arrows"><i></i><i></i></div>',
  mechanical: `<div class="fx-gears">${gearSvg('gear-a')}${gearSvg('gear-b')}</div>`,
  nursing:
    '<div class="fx-ecg"><svg viewBox="0 0 300 80" fill="none" stroke="currentColor" stroke-width="2"><polyline class="ecg-line" points="0,40 38,40 50,40 58,16 66,64 76,40 108,40 120,40 128,28 136,52 144,40 178,40 190,40 198,12 206,68 216,40 300,40"/></svg></div>',
  ecommerce: '<div class="fx-bag"><i class="bag-handle"></i><i class="bag-body"></i></div>',
  accounting:
    '<div class="fx-bars ledger"><i style="height:44px"></i><i style="height:74px"></i><i style="height:58px"></i><i style="height:92px"></i></div>',
  data: '<div class="fx-bars"><i style="height:52px"></i><i style="height:96px"></i><i style="height:70px"></i><i style="height:126px"></i></div>'
};

function renderJobBackdrop() {
  const jobId = (app.state && app.state.job && app.state.job.id) || '';
  const root = document.documentElement;
  if (root.dataset.job === jobId) return;
  root.dataset.job = jobId;
  const scene = $('#jobFx');
  if (scene) scene.innerHTML = JOB_FX[jobId] || '';
  const layer = $('#jobBackdrop');
  if (!layer) return;
  layer.classList.remove('fade');
  void layer.offsetWidth;
  layer.classList.add('fade');
}

function renderTabs() {
  const modes = availableModes();
  document.querySelectorAll('#modeTabs button').forEach((button) => {
    const visible = modes.includes(button.dataset.mode);
    button.classList.toggle('hidden', !visible);
    button.classList.toggle('active', button.dataset.mode === app.mode);
  });
}

function renderBanner() {
  const banner = $('#engineBanner');
  const llm = app.state && app.state.llm;
  if (!llm) return;
  if (llm.degraded) {
    banner.className = 'engine-banner warn';
    banner.textContent = `模型服务暂不可用，已自动切换离线规则引擎，全流程仍可继续。${llm.lastError ? `（${llm.lastError}）` : ''}`;
    return;
  }
  if (llm.mode === 'rule') {
    banner.className = 'engine-banner';
    banner.textContent = '当前为离线演示模式：未配置模型密钥，使用内置规则引擎。在 .env 中配置密钥后自动接入大模型。';
    return;
  }
  banner.className = 'engine-banner hidden';
}

function renderAgentHead() {
  const meta = AGENTS[app.mode];
  $('#agentTitle').textContent = meta.title;
  const llm = app.state && app.state.llm;
  const tag = $('#engineTag');
  if (llm && llm.mode === 'llm' && !llm.degraded) {
    tag.textContent = llm.model ? `大模型 · ${llm.model}` : '大模型';
  } else {
    tag.textContent = '离线规则引擎';
  }
  $('#agentDot').style.background = app.busy ? '#f59e0b' : '#10b981';
  $('#tipText').textContent = meta.emptyText;
}

function renderProfile() {
  const profile = app.state && app.state.profile;
  const box = $('#profileSummary');
  if (!profile || isEmptyProfile(profile)) {
    box.innerHTML =
      '<p class="muted" style="margin:0;font-size:12.5px;line-height:1.7">还没有画像信息，点击右上角「编辑」补全学校类型、年级、专业和目标岗位，建议会更准。</p>';
    return;
  }
  const skills = (profile.skills || []).map((skill) => {
    if (typeof skill === 'string') return skill;
    return skill.level ? `${skill.name}（${skill.level}）` : skill.name;
  });
  const gradeText = [profile.schoolType, profile.grade].filter(Boolean).join(' · ');
  box.innerHTML = `
    <div class="profile-row"><span>学校类型</span><strong>${escapeHtml(profile.schoolType || '未填写')}</strong></div>
    <div class="profile-row"><span>年级</span><strong>${escapeHtml(gradeText || '未填写')}</strong></div>
    <div class="profile-row"><span>专业</span><strong>${escapeHtml(profile.major || '未填写')}</strong></div>
    <div class="profile-row"><span>目标岗位</span><strong>${escapeHtml(profile.targetJob || '未设定')}</strong></div>
    <div class="profile-row"><span>已有技能</span><strong>${escapeHtml(skills.join('、') || '未填写')}</strong></div>
  `;
}

function renderJobSkills() {
  const job = app.state && app.state.job;
  if (!job) {
    $('#jobName').textContent = '待选择岗位';
    $('#jobSummary').textContent = '';
    $('#jobSkills').innerHTML = '';
    return;
  }
  const profile = (app.state && app.state.profile) || {};
  $('#jobBadge').textContent = profile.targetJob ? '已对齐' : '推荐岗位';
  $('#jobName').textContent = job.name || '待选择岗位';
  $('#jobSummary').textContent = job.summary || '';
  $('#jobDetailBtn').classList.toggle('hidden', !(job.id || job.name));
  $('#jobSkills').innerHTML = (job.skills || [])
    .slice(0, 8)
    .map(
      (skill) =>
        `<span class="skill-chip"><span class="skill-name">${escapeHtml(skill.name)}</span>${
          skill.level ? `<span class="skill-level">${escapeHtml(skill.level)}</span>` : ''
        }</span>`
    )
    .join('');
}

function renderProgress() {
  const resume = (app.state && app.state.resume) || { completeness: 0 };
  const percent = resume.completeness || 0;
  if (app.progress.resume !== percent) {
    app.progress.resume = percent;
    $('#resumeCompleteness').textContent = percent + '%';
    $('#resumeBar').style.width = percent + '%';
  }

  const plan = app.state && app.state.plan;
  let done = 0;
  let total = 0;
  if (plan && Array.isArray(plan.phases)) {
    plan.phases.forEach((phase) => {
      (phase.tasks || []).forEach((task) => {
        total += 1;
        if (task.done) done += 1;
      });
    });
  }
  const planKey = `${done}/${total}`;
  if (app.progress.plan !== planKey) {
    app.progress.plan = planKey;
    $('#planProgress').textContent = planKey;
    $('#planBar').style.width = (total ? Math.round((done / total) * 100) : 0) + '%';
  }
}

function currentMessages() {
  return ((app.state && app.state.messages) || []).filter((message) => message.agent === app.mode);
}

function messageHtml(message, animate) {
  const isUser = message.role === 'user';
  const question =
    !isUser && message.meta && message.meta.nextQuestion && !String(message.content).includes(message.meta.nextQuestion)
      ? `<div class="question">${escapeHtml(message.meta.nextQuestion)}</div>`
      : '';
  return `
    <div class="msg ${isUser ? 'user' : 'assistant'}${animate ? ' anim' : ''}">
      <div class="avatar">${isUser ? '我' : '罗'}</div>
      <div class="bubble">${linkify(message.content)}${question}</div>
    </div>`;
}

function typingHtml() {
  return `
    <div class="msg assistant">
      <div class="avatar">罗</div>
      <div class="bubble typing"><i></i><i></i><i></i></div>
    </div>`;
}

function renderMessages() {
  const box = $('#messages');
  const list = currentMessages();
  if (!list.length && !app.busy) {
    const meta = AGENTS[app.mode];
    box.innerHTML = `<div class="empty-state"><strong>${escapeHtml(meta.emptyTitle)}</strong>${escapeHtml(
      meta.emptyText
    )}</div>`;
    return;
  }
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  box.innerHTML =
    list.map((message, index) => messageHtml(message, index === list.length - 1)).join('') +
    (app.busy ? typingHtml() : '');
  if (nearBottom || app.busy) {
    window.requestAnimationFrame(() => {
      box.scrollTop = box.scrollHeight;
    });
  }
}

function renderSuggestions() {
  const box = $('#suggestions');
  const list = currentMessages();
  const last = list[list.length - 1];
  const suggestions =
    !app.busy && last && last.role === 'assistant' && last.meta && Array.isArray(last.meta.suggestions)
      ? last.meta.suggestions
      : [];
  box.innerHTML = suggestions
    .filter(Boolean)
    .map((text) => `<button type="button" class="suggestion" data-suggestion="${escapeHtml(text)}">${escapeHtml(text)}</button>`)
    .join('');
}

function emptyPanel(title, text, action) {
  return `<div class="empty-panel"><strong>${escapeHtml(title)}</strong>${escapeHtml(text)}${action || ''}</div>`;
}

function renderResultPanel() {
  const panel = $('#resultPanel');
  if (!app.state) {
    app.panelSig = '';
    panel.innerHTML = emptyPanel('正在加载', '请稍候…', '');
    return;
  }
  if (app.mode === 'growth') {
    const plan = app.state.plan;
    if (!plan || !Array.isArray(plan.phases) || !plan.phases.length) {
      app.panelSig = '';
      panel.innerHTML = planPanelHtml();
      return;
    }
    const sig = planStructureSig(plan);
    if (sig === app.panelSig && panel.querySelector('[data-ring]')) {
      syncPlanPanel(plan);
      return;
    }
    app.panelSig = sig;
    panel.innerHTML = planPanelHtml();
    syncPlanPanel(plan);
    return;
  }
  app.panelSig = '';
  if (app.mode === 'resume') panel.innerHTML = resumePanelHtml();
  else panel.innerHTML = interviewPanelHtml();
}

const SKILL_LEVELS = [
  ['精通', 100],
  ['熟练', 85],
  ['掌握', 65],
  ['熟悉', 45],
  ['了解', 25],
  ['未接触', 5],
  ['未确认', 5],
  ['未掌握', 5],
  ['不会', 5]
];

function levelScore(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  if (/^\d+(\.\d+)?$/.test(text)) return Math.max(0, Math.min(100, Number(text)));
  if (/^(未|不|没)/.test(text)) return 5;
  const hit = SKILL_LEVELS.find(([word]) => text.includes(word));
  return hit ? hit[1] : 0;
}

function normalizeSkillLevel(value) {
  const score = levelScore(value);
  if (!score) return '';
  let best = SKILL_LEVELS[0];
  for (const item of SKILL_LEVELS) {
    if (Math.abs(item[1] - score) < Math.abs(best[1] - score)) best = item;
  }
  return best[0];
}

function dimensionRatio(item) {
  const target = levelScore(item.target) || 100;
  const current = levelScore(item.current);
  const raw = Math.round((current / target) * 100);
  return Math.max(8, Math.min(100, raw || 8));
}

function planPanelHtml() {
  const plan = app.state.plan;
  if (!plan || !Array.isArray(plan.phases) || !plan.phases.length) {
    return emptyPanel('提升计划待生成', '和成长教练聊 4 轮左右，我会根据目标岗位生成 12 周提升计划。', '');
  }
  const score = Math.max(0, Math.min(100, Number(plan.matchScore) || 0));
  const dimensions = (plan.dimensions || [])
    .slice(0, 8)
    .map((item, index) => {
      const ratio = dimensionRatio(item);
      const tone = ratio >= 85 ? 'met' : ratio < 50 ? 'far' : '';
      return `
        <div class="dimension" data-dim="${index}">
          <div class="dimension-top"><span>${escapeHtml(item.name)}</span><span class="dimension-pct">${ratio}%</span></div>
          <div class="bar"><i class="${tone}" data-w="${ratio}" style="--w:${ratio}%"></i></div>
          <div class="dimension-note" data-value="">当前 ${escapeHtml(item.current || '未确认')} · 目标 ${escapeHtml(
        item.target || ''
      )} · 差距 ${Number(item.gap) || 0}</div>
          <div class="advice">${escapeHtml(item.advice || '')}</div>
        </div>`;
    })
    .join('');
  const phases = (plan.phases || [])
    .map((phase, phaseIndex) => {
      const tasks = (phase.tasks || [])
        .map(
          (task, taskIndex) => `
          <label class="task ${task.done ? 'done' : ''}">
            <input type="checkbox" data-task="${phaseIndex}:${taskIndex}" ${task.done ? 'checked' : ''} />
            <span>${escapeHtml(task.text)}</span>
          </label>`
        )
        .join('');
      return `<div class="phase"><h5>${escapeHtml(phase.title || '阶段')}</h5>${tasks}</div>`;
    })
    .join('');
  const highlights = (plan.highlights || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const resources = (plan.resources || [])
    .map(
      (item) =>
        `<li><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.note || '')}</span>${
          item.url
            ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">打开链接</a>`
            : ''
        }</li>`
    )
    .join('');
  return `
    <div class="panel-head"><h3>提升计划</h3><span>${escapeHtml(plan.targetJob || '')}</span></div>
    <div class="match-ring">
      <div class="ring" data-ring data-value="${score}" style="--value:${score}%"><div class="ring-inner"><b data-score>${score}</b><small>匹配度</small></div></div>
      <div class="match-text" data-gap-summary>${escapeHtml(plan.gapSummary || '')}</div>
    </div>
    <div class="section"><h4>能力差距</h4>${dimensions || '<p class="muted">暂无数据</p>'}</div>
    <div class="section"><h4>阶段任务</h4>${phases || '<p class="muted">暂无任务</p>'}</div>
    ${highlights ? `<div class="section"><h4>简历亮点</h4><ul class="highlight-list">${highlights}</ul></div>` : ''}
    ${resources ? `<div class="section"><h4>推荐资源</h4><ul class="resource-list">${resources}</ul></div>` : ''}
  `;
}

function planStructureSig(plan) {
  return JSON.stringify({
    job: plan.targetJob || '',
    dims: (plan.dimensions || []).slice(0, 8).map((item) => item.name),
    phases: (plan.phases || []).map((phase) => [phase.title || '', (phase.tasks || []).map((task) => task.text)]),
    highlights: plan.highlights || [],
    resources: (plan.resources || []).map((item) => [item.name, item.note || '', item.url || ''])
  });
}

function syncPlanPanel(plan) {
  const panel = $('#resultPanel');
  if (!panel) return;
  const score = Math.max(0, Math.min(100, Number(plan.matchScore) || 0));
  const ring = panel.querySelector('[data-ring]');
  if (ring && ring.dataset.value !== String(score)) {
    ring.dataset.value = String(score);
    ring.style.setProperty('--value', score + '%');
  }
  const scoreEl = panel.querySelector('[data-score]');
  if (scoreEl && scoreEl.textContent !== String(score)) scoreEl.textContent = String(score);
  const gapEl = panel.querySelector('[data-gap-summary]');
  if (gapEl && gapEl.dataset.value !== String(plan.gapSummary || '')) {
    gapEl.dataset.value = String(plan.gapSummary || '');
    gapEl.textContent = plan.gapSummary || '';
  }
  (plan.dimensions || []).slice(0, 8).forEach((item, index) => {
    const node = panel.querySelector(`[data-dim="${index}"]`);
    if (!node) return;
    const ratio = dimensionRatio(item);
    const bar = node.querySelector('.bar i');
    if (bar && bar.dataset.w !== String(ratio)) {
      bar.dataset.w = String(ratio);
      bar.style.setProperty('--w', ratio + '%');
      bar.className = ratio >= 85 ? 'met' : ratio < 50 ? 'far' : '';
    }
    const pct = node.querySelector('.dimension-pct');
    if (pct && pct.textContent !== `${ratio}%`) pct.textContent = `${ratio}%`;
    const note = node.querySelector('.dimension-note');
    if (note) {
      const noteText = `当前 ${item.current || '未确认'} · 目标 ${item.target || ''} · 差距 ${Number(item.gap) || 0}`;
      if (note.dataset.value !== noteText) {
        note.dataset.value = noteText;
        note.textContent = noteText;
      }
    }
  });
  (plan.phases || []).forEach((phase, phaseIndex) => {
    (phase.tasks || []).forEach((task, taskIndex) => {
      const input = panel.querySelector(`input[data-task="${phaseIndex}:${taskIndex}"]`);
      if (!input) return;
      const isDone = Boolean(task.done);
      if (input.checked !== isDone) input.checked = isDone;
      const label = input.closest('.task');
      if (label) label.classList.toggle('done', isDone);
    });
  });
}

function fieldHtml(label, path, value, options = {}) {
  const convert = options.convert ? ` data-convert="${options.convert}"` : '';
  return `<label class="field"><span>${escapeHtml(label)}</span><input data-path="${path}"${convert} value="${escapeHtml(
    value || ''
  )}" placeholder="待补充" /></label>`;
}

function textareaHtml(label, path, value, convert) {
  const text = Array.isArray(value) ? value.join('\n') : value || '';
  return `<label class="field"><span>${escapeHtml(label)}</span><textarea data-path="${path}" data-convert="${convert}" rows="3" placeholder="待补充">${escapeHtml(
    text
  )}</textarea></label>`;
}

function resumeFormHtml(draft) {
  const basic = draft.basic || {};
  const education = draft.education || {};
  const skillsText = (draft.skills || [])
    .map((skill) => (skill.level ? `${skill.name}(${skill.level})` : skill.name))
    .join(', ');
  const projects = (draft.projects || [])
    .map(
      (project, index) => `
      <div class="phase">
        <h5>项目 ${index + 1} <button type="button" class="link" data-action="removeProject" data-index="${index}">删除</button></h5>
        <div class="grid-2">
          ${fieldHtml('项目名称', `projects.${index}.name`, project.name)}
          ${fieldHtml('担任角色', `projects.${index}.role`, project.role)}
        </div>
        ${fieldHtml('技术栈', `projects.${index}.tech`, (project.tech || []).join(', '), { convert: 'list' })}
        ${fieldHtml('项目背景', `projects.${index}.background`, project.background)}
        ${textareaHtml('你做了什么（每行一条）', `projects.${index}.actions`, project.actions, 'lines')}
        ${textareaHtml('取得成果（每行一条）', `projects.${index}.results`, project.results, 'lines')}
      </div>`
    )
    .join('');
  const internships = (draft.internships || [])
    .map(
      (item, index) => `
      <div class="phase">
        <h5>实习 ${index + 1} <button type="button" class="link" data-action="removeInternship" data-index="${index}">删除</button></h5>
        <div class="grid-2">
          ${fieldHtml('公司', `internships.${index}.company`, item.company)}
          ${fieldHtml('岗位', `internships.${index}.role`, item.role)}
        </div>
        ${fieldHtml('时间', `internships.${index}.period`, item.period)}
        ${textareaHtml('你做了什么（每行一条）', `internships.${index}.actions`, item.actions, 'lines')}
        ${textareaHtml('取得成果（每行一条）', `internships.${index}.results`, item.results, 'lines')}
      </div>`
    )
    .join('');
  const awards = (draft.awards || [])
    .map(
      (item, index) => `
      <div class="phase">
        <h5>奖项 / 证书 ${index + 1} <button type="button" class="link" data-action="removeAward" data-index="${index}">删除</button></h5>
        <div class="grid-2">
          ${fieldHtml('名称', `awards.${index}.name`, item.name)}
          ${fieldHtml('时间', `awards.${index}.date`, item.date)}
        </div>
        ${fieldHtml('级别', `awards.${index}.level`, item.level)}
      </div>`
    )
    .join('');
  return `
    <div class="section">
      <h4>基本信息</h4>
      <div class="grid-2">
        ${fieldHtml('姓名', 'basic.name', basic.name)}
        ${fieldHtml('手机号', 'basic.phone', basic.phone)}
        ${fieldHtml('邮箱', 'basic.email', basic.email)}
        ${fieldHtml('意向城市', 'basic.city', basic.city)}
      </div>
      ${fieldHtml('目标岗位', 'basic.targetJob', basic.targetJob)}
    </div>
    <div class="section">
      <h4>教育背景</h4>
      <div class="grid-2">
        ${fieldHtml('学校', 'education.school', education.school)}
        ${fieldHtml('专业', 'education.major', education.major)}
        ${fieldHtml('学历', 'education.degree', education.degree)}
        ${fieldHtml('在校时间', 'education.startEnd', education.startEnd)}
      </div>
      ${fieldHtml('GPA / 成绩', 'education.gpa', education.gpa)}
    </div>
    <div class="section">
      <h4>专业技能</h4>
      ${fieldHtml('技能（逗号分隔，可写熟练度）', 'skills', skillsText, { convert: 'skills' })}
    </div>
    <div class="section">
      <h4>项目经历 <button type="button" class="link" data-action="addProject">新增</button></h4>
      ${projects || '<p class="muted">暂无项目，点击新增</p>'}
    </div>
    <div class="section">
      <h4>实习经历 <button type="button" class="link" data-action="addInternship">新增</button></h4>
      ${internships || '<p class="muted">暂无实习，点击新增</p>'}
    </div>
    <div class="section">
      <h4>奖项 / 证书 <button type="button" class="link" data-action="addAward">新增</button></h4>
      ${awards || '<p class="muted">暂无奖项，点击新增</p>'}
    </div>
    <div class="section">
      <h4>自我评价</h4>
      <label class="field"><textarea data-path="selfEvaluation" rows="3" placeholder="待补充">${escapeHtml(
        draft.selfEvaluation || ''
      )}</textarea></label>
    </div>
  `;
}

function resumePanelHtml() {
  const resume = app.state.resume || { version: 0, completeness: 0 };
  const draft = app.draft || resume.data;
  return `
    <div class="panel-head">
      <h3>简历草稿</h3>
      <span><span id="resumeVersion">v${resume.version}</span> · <span id="resumePercent">${
    resume.completeness || 0
  }%</span> <span class="autosave" id="autosave">已保存</span></span>
    </div>
    <div class="mini-actions">
      <button type="button" class="ghost" data-action="syncResume">从对话同步</button>
      <button type="button" class="ghost" data-action="resetResume">清空重来</button>
    </div>
    ${resumeFormHtml(draft)}
  `;
}

function interviewPanelHtml() {
  const interview = app.state.interview;
  if (!interview) {
    return emptyPanel(
      '还没有面试记录',
      '点击开始后，我会用你的最新简历草稿提问，并根据回答继续追问。',
      '<div class="mini-actions"><button type="button" class="primary" data-action="startInterview">开始模拟面试</button></div>'
    );
  }
  if (interview.status === 'finished' && interview.score) {
    const score = interview.score;
    const overall = Math.max(0, Math.min(100, Number(score.overall) || 0));
    const dimensions = (score.dimensions || [])
      .map(
        (item) => `
        <div class="score-dim">
          <div><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.comment || '')}</p></div>
          <strong>${Number(item.score) || 0}</strong>
        </div>`
      )
      .join('');
    return `
      <div class="panel-head"><h3>面试评分</h3><span>${escapeHtml(interview.targetJob || '')}</span></div>
      <div class="score-ring" style="--value:${overall}%"><div class="ring-inner">${overall}</div></div>
      <p class="score-note">${escapeHtml(score.summary || '')}</p>
      <div class="section"><h4>分维度表现</h4>${dimensions}</div>
      <div class="mini-actions">
        <button type="button" class="primary" data-action="restartInterview">再来一轮</button>
      </div>
    `;
  }
  const rounds = (interview.rounds || [])
    .map(
      (round, index) => `
      <div class="round">
        <div class="round-q">第 ${index + 1} 轮 · ${escapeHtml(round.question || '')}</div>
        <div class="round-a">${round.answer ? escapeHtml(round.answer) : '等待你的回答…'}</div>
        ${round.feedback ? `<div class="round-f">${escapeHtml(round.feedback)}</div>` : ''}
      </div>`
    )
    .join('');
  return `
    <div class="panel-head"><h3>面试进行中</h3><span>${escapeHtml(interview.targetJob || '')}</span></div>
    ${rounds || '<p class="muted">等待第一个问题…</p>'}
    <div class="mini-actions">
      <button type="button" class="ghost" data-action="finishInterview">提前结束并评分</button>
    </div>
  `;
}

function syncDraft(force = false) {
  if (!app.state || !app.state.resume) return;
  const active = document.activeElement;
  const editing = active && $('#resultPanel').contains(active);
  if (force || !app.draft || (!app.draftDirty && !editing)) {
    app.draft = clone(app.state.resume.data);
    app.draftDirty = false;
  }
}

function scheduleResumeSave() {
  clearTimeout(app.saveTimer);
  app.saveTimer = setTimeout(saveResumeDraft, 900);
}

async function saveResumeDraft() {
  if (!app.draft) return;
  const snapshot = JSON.stringify(app.draft);
  try {
    const data = await api('/api/resume', { method: 'PATCH', body: { resume: app.draft } });
    app.state = data.state;
    app.lastSaved = data.state.resume;
    if (JSON.stringify(app.draft) === snapshot) {
      app.draftDirty = false;
    } else {
      scheduleResumeSave();
    }
    const version = $('#resumeVersion');
    const percent = $('#resumePercent');
    const tag = $('#autosave');
    if (version) version.textContent = 'v' + data.version;
    if (percent) percent.textContent = (app.state.resume.completeness || 0) + '%';
    renderProgress();
    if (tag) {
      tag.classList.add('show');
      setTimeout(() => tag.classList.remove('show'), 1500);
    }
  } catch (error) {
    toast('草稿保存失败：' + error.message);
  }
}

function onPanelInput(event) {
  const target = event.target;
  const path = target.dataset.path;
  if (!path || !app.draft) return;
  const convert = target.dataset.convert;
  let value = target.value;
  if (convert === 'lines') {
    value = value
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
  } else if (convert === 'list') {
    value = value
      .split(/[,，、]/)
      .map((item) => item.trim())
      .filter(Boolean);
  } else if (convert === 'skills') {
    value = value
      .split(/[,，、]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const match = item.match(/^(.+?)\s*[（(]\s*(.+?)\s*[)）]\s*$/);
        return match ? { name: match[1].trim(), level: match[2].trim() } : { name: item, level: '' };
      })
      .filter((item) => item.name);
  }
  setPath(app.draft, path, value);
  app.draftDirty = true;
  scheduleResumeSave();
}

async function onPanelChange(event) {
  const target = event.target;
  if (!target.dataset.task) return;
  const [phaseIndex, taskIndex] = target.dataset.task.split(':').map(Number);
  const plan = app.state && app.state.plan;
  if (!plan || !plan.phases[phaseIndex] || !plan.phases[phaseIndex].tasks[taskIndex]) return;
  plan.phases[phaseIndex].tasks[taskIndex].done = target.checked;
  const label = target.closest('.task');
  if (label) label.classList.toggle('done', target.checked);
  renderProgress();
  try {
    const data = await api('/api/plan', { method: 'PATCH', body: { plan } });
    app.state = data.state || app.state;
  } catch (error) {
    toast('计划保存失败：' + error.message);
  }
}

async function onPanelClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  try {
    if (action === 'syncResume') {
      const data = await api('/api/state');
      app.state = data.state;
      syncDraft(true);
      renderAll();
      toast('已从对话同步最新草稿');
    } else if (action === 'resetResume') {
      if (!window.confirm('确定清空当前简历草稿并重新开始吗？历史版本会保留在数据库中。')) return;
      const data = await api('/api/resume/reset', { method: 'POST' });
      app.state = data.state;
      syncDraft(true);
      renderAll();
      toast('草稿已清空');
    } else if (action === 'addProject') {
      app.draft.projects.push({ name: '', role: '', period: '', background: '', actions: [], results: [], tech: [] });
      app.draftDirty = true;
      renderResultPanel();
      scheduleResumeSave();
    } else if (action === 'removeProject') {
      app.draft.projects.splice(Number(button.dataset.index), 1);
      app.draftDirty = true;
      if (!app.draft.projects.length)
        app.draft.projects.push({ name: '', role: '', period: '', background: '', actions: [], results: [], tech: [] });
      renderResultPanel();
      scheduleResumeSave();
    } else if (action === 'addInternship') {
      app.draft.internships.push({ company: '', role: '', period: '', actions: [], results: [] });
      app.draftDirty = true;
      renderResultPanel();
      scheduleResumeSave();
    } else if (action === 'removeInternship') {
      app.draft.internships.splice(Number(button.dataset.index), 1);
      app.draftDirty = true;
      renderResultPanel();
      scheduleResumeSave();
    } else if (action === 'addAward') {
      app.draft.awards.push({ name: '', date: '', level: '' });
      app.draftDirty = true;
      renderResultPanel();
      scheduleResumeSave();
    } else if (action === 'removeAward') {
      app.draft.awards.splice(Number(button.dataset.index), 1);
      app.draftDirty = true;
      renderResultPanel();
      scheduleResumeSave();
    } else if (action === 'startInterview') {
      if (app.mode !== 'interview') switchMode('interview');
      send('');
    } else if (action === 'finishInterview') {
      const data = await api('/api/interview/finish', { method: 'POST' });
      app.state = data.state;
      renderAll();
      toast('面试已结束，评分已生成');
    } else if (action === 'restartInterview') {
      const data = await api('/api/interview/restart', { method: 'POST' });
      app.state = data.state;
      renderAll();
      setTimeout(() => send(''), 120);
    }
  } catch (error) {
    toast(error.message);
  }
}

async function send(message) {
  if (app.busy) return;
  const agent = app.mode;
  const text = String(message || '');
  app.busy = true;
  app.pendingMessage = text
    ? { agent, role: 'user', content: text, meta: null, createdAt: new Date().toISOString() }
    : null;
  if (app.pendingMessage && app.state && Array.isArray(app.state.messages)) {
    app.state.messages.push(app.pendingMessage);
  }
  updateComposer();
  renderMessages();
  renderSuggestions();
  renderAgentHead();
  try {
    const data = await api('/api/chat', { method: 'POST', body: { agent, message: text } });
    if (app.lastSaved && data.state.resume && data.state.resume.version < app.lastSaved.version) {
      data.state.resume = app.lastSaved;
    }
    app.state = data.state;
    app.pendingMessage = null;
    if (data.notice) toast(data.notice, 4200);
  } catch (error) {
    if (app.pendingMessage && app.state && Array.isArray(app.state.messages)) {
      const index = app.state.messages.indexOf(app.pendingMessage);
      if (index >= 0) app.state.messages.splice(index, 1);
    }
    app.pendingMessage = null;
    toast('对话失败：' + error.message);
  } finally {
    app.busy = false;
    updateComposer();
    renderAll();
    if (agent === app.mode) $('#input').focus();
  }
}

function switchMode(mode) {
  if (app.mode === mode) return;
  if (!availableModes().includes(mode)) {
    toast('当前年级暂不开放这个模块，可在「我的画像」里调整');
    return;
  }
  app.mode = mode;
  saveLocal({ mode });
  renderAll();
  ensureStarted();
}

function ensureStarted(retry = 0) {
  if (app.busy) {
    if (retry < 20) setTimeout(() => ensureStarted(retry + 1), 200);
    return;
  }
  const list = currentMessages();
  if (list.length) return;
  if (app.mode === 'interview') {
    const interview = app.state.interview;
    if (interview && interview.status === 'finished' && interview.score) return;
  }
  send('');
}

function autoGrow() {
  const input = $('#input');
  input.style.height = 'auto';
  input.style.height = Math.min(140, input.scrollHeight) + 'px';
}

function syncGradeOptions(selected) {
  const schoolType = $('#pfSchoolType').value;
  const grades = SCHOOL_GRADES[schoolType] || [];
  const select = $('#pfGrade');
  select.innerHTML = grades.length
    ? grades.map((grade) => `<option value="${grade}">${grade}</option>`).join('')
    : '<option value="">请先选择学校类型</option>';
  if (selected && grades.includes(selected)) {
    select.value = selected;
  }
}

function fillJobOptions(selected) {
  const jobs = (app.meta && app.meta.jobs) || [];
  const select = $('#pfJob');
  select.innerHTML = jobs
    .map((job) => `<option value="${escapeHtml(job.name)}">${escapeHtml(job.name)}</option>`)
    .join('');
  if (selected) select.value = selected;
  else if (jobs[0]) select.value = jobs[0].name;
}

function collectFormSkills() {
  return $('#pfSkills')
    .value.split(/[,，、]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const match = item.match(/^(.+?)\s*[（(]\s*(.+?)\s*[)）]\s*$/);
      if (!match) return { name: item, level: '' };
      return { name: match[1].trim(), level: normalizeSkillLevel(match[2]) };
    })
    .filter((item) => item.name);
}

function openProfileModal() {
  const profile = (app.state && app.state.profile) || {};
  fillJobOptions(profile.targetJob);
  let schoolType = profile.schoolType || '';
  if (!schoolType && profile.grade) {
    schoolType = '高校';
  }
  $('#pfSchoolType').value = schoolType;
  syncGradeOptions(profile.grade);
  $('#pfMajor').value = profile.major || '';
  $('#pfSkills').value = (profile.skills || [])
    .map((skill) => {
      if (typeof skill === 'string') return skill;
      return skill.level ? `${skill.name}（${skill.level}）` : skill.name;
    })
    .join(', ');
  app.analysis = null;
  $('#pfAnalyzeResult').innerHTML = '';
  $('#profileModal').classList.remove('hidden');
}

function closeProfileModal() {
  $('#profileModal').classList.add('hidden');
}

async function saveProfile() {
  const schoolType = $('#pfSchoolType').value;
  const grade = $('#pfGrade').value;
  if (!schoolType) {
    toast('请先选择高校或高职');
    return;
  }
  if (!grade) {
    toast('请选择年级');
    return;
  }
  const payload = {
    schoolType,
    grade,
    major: $('#pfMajor').value.trim(),
    targetJob: $('#pfJob').value,
    skills: collectFormSkills()
  };
  try {
    const data = await api('/api/profile', { method: 'PUT', body: payload });
    app.state = data.state;
    saveLocal({ profile: payload });
    closeProfileModal();
    renderAll();
    toast('画像已保存，下次打开会自动恢复');
    ensureStarted();
  } catch (error) {
    toast('保存失败：' + error.message);
  }
}

function findJobMeta(idOrName) {
  const jobs = (app.meta && app.meta.jobs) || [];
  const target = String(idOrName || '').trim();
  if (!target) return null;
  return (
    jobs.find((job) => job.id === target || job.name === target) ||
    jobs.find((job) => job.name.includes(target) || target.includes(job.name)) ||
    null
  );
}

function openJobDetail(idOrName) {
  const job = findJobMeta(idOrName) || (app.state && app.state.job) || null;
  if (!job) {
    toast('暂无岗位信息');
    return;
  }
  app.jobTarget = job;
  $('#jobDetailTitle').textContent = job.name || '岗位详情';
  $('#jobDetailSummary').textContent = job.summary || '暂无简介';
  $('#jobDetailMajors').innerHTML =
    (job.majors || []).map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join('') ||
    '<span class="muted">暂无</span>';
  $('#jobDetailProjects').innerHTML =
    (job.projects || []).map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join('') ||
    '<span class="muted">暂无</span>';
  $('#jobDetailSkills').innerHTML = (job.skills || [])
    .map(
      (skill) => `
      <div class="skill-row">
        <span class="skill-name">${escapeHtml(skill.name)}</span>
        <span class="skill-level">${escapeHtml(skill.level || '')}</span>
      </div>`
    )
    .join('');
  $('#jobDetailFocus').innerHTML =
    (job.interviewFocus || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('') ||
    '<li class="muted">暂无</li>';
  $('#jobDetailResources').innerHTML =
    (job.resources || [])
      .map(
        (item) =>
          `<li><strong>${escapeHtml(item.name)}</strong>${item.note ? `<span>${escapeHtml(item.note)}</span>` : ''}${
            item.url
              ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">打开链接</a>`
              : ''
          }</li>`
      )
      .join('') || '<li class="muted">暂无</li>';
  $('#jobModal').classList.remove('hidden');
}

function closeJobModal() {
  $('#jobModal').classList.add('hidden');
}

async function pickJob() {
  const job = app.jobTarget;
  if (!job) return;
  const profileModalOpen = !$('#profileModal').classList.contains('hidden');
  if (profileModalOpen) {
    const select = $('#pfJob');
    select.value = job.name;
    closeJobModal();
    toast('已填入目标岗位，点击「保存并开始」生效');
    return;
  }
  const profile = (app.state && app.state.profile) || {};
  if (isEmptyProfile(profile)) {
    closeJobModal();
    openProfileModal();
    $('#pfJob').value = job.name;
    toast('请先完善画像，再保存岗位');
    return;
  }
  try {
    const payload = { ...profile, targetJob: job.name };
    const data = await api('/api/profile', { method: 'PUT', body: payload });
    app.state = data.state;
    saveLocal({ profile: payload });
    closeJobModal();
    renderAll();
    toast(`目标岗位已切换为「${job.name}」`);
  } catch (error) {
    toast('保存失败：' + error.message);
  }
}

async function analyzeProfile() {
  const button = $('#pfAnalyze');
  button.disabled = true;
  button.textContent = '分析中…';
  try {
    const data = await api('/api/analyze', {
      method: 'POST',
      body: {
        schoolType: $('#pfSchoolType').value,
        grade: $('#pfGrade').value,
        major: $('#pfMajor').value.trim(),
        skills: collectFormSkills()
      }
    });
    app.analysis = data.items || [];
    renderAnalysis();
  } catch (error) {
    toast('分析失败：' + error.message);
  } finally {
    button.disabled = false;
    button.textContent = '帮我分析';
  }
}

function renderAnalysis() {
  const box = $('#pfAnalyzeResult');
  if (!app.analysis || !app.analysis.length) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = app.analysis
    .map(
      (item) => `
      <div class="analyze-item">
        <div class="analyze-top">
          <strong>${escapeHtml(item.name)}</strong>
          <span class="analyze-score">${item.score}%</span>
        </div>
        <div class="bar"><i style="width:${item.score}%"></i></div>
        <p class="analyze-summary">${escapeHtml(item.summary || '')}</p>
        <div class="analyze-reasons">
          ${item.reasons.map((reason) => `<span class="reason">${escapeHtml(reason)}</span>`).join('')}
        </div>
        <button type="button" class="ghost small" data-pick-job="${escapeHtml(item.name)}">设为目标岗位</button>
      </div>`
    )
    .join('');
}

function openFeedback() {
  app.feedbackScore = 0;
  document.querySelectorAll('#stars button').forEach((button) => button.classList.remove('active'));
  $('#fbComment').value = '';
  $('#feedbackModal').classList.remove('hidden');
}

async function submitFeedback() {
  if (!app.feedbackScore) {
    toast('请先选择一个评分');
    return;
  }
  try {
    await api('/api/feedback', {
      method: 'POST',
      body: { rating: app.feedbackScore, comment: $('#fbComment').value.trim() }
    });
    $('#feedbackModal').classList.add('hidden');
    toast('感谢反馈，已经记录啦');
  } catch (error) {
    toast('提交失败：' + error.message);
  }
}

function bindEvents() {
  $('#modeTabs').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-mode]');
    if (button) switchMode(button.dataset.mode);
  });

  $('#suggestions').addEventListener('click', (event) => {
    const button = event.target.closest('[data-suggestion]');
    if (!button) return;
    send(button.dataset.suggestion);
  });

  $('#sendBtn').addEventListener('click', () => {
    const value = $('#input').value.trim();
    if (!value) return;
    $('#input').value = '';
    autoGrow();
    send(value);
  });

  $('#input').addEventListener('input', autoGrow);
  $('#input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      $('#sendBtn').click();
    }
  });

  $('#resultPanel').addEventListener('input', onPanelInput);
  $('#resultPanel').addEventListener('change', onPanelChange);
  $('#resultPanel').addEventListener('click', onPanelClick);

  $('#profileBtn').addEventListener('click', openProfileModal);
  $('#editProfile').addEventListener('click', openProfileModal);
  $('#profileSave').addEventListener('click', saveProfile);
  $('#profileSkip').addEventListener('click', () => {
    closeProfileModal();
    ensureStarted();
  });

  $('#pfSchoolType').addEventListener('change', () => syncGradeOptions(''));
  $('#pfJobDetail').addEventListener('click', () => openJobDetail($('#pfJob').value));
  $('#pfAnalyze').addEventListener('click', analyzeProfile);
  $('#pfAnalyzeResult').addEventListener('click', (event) => {
    const button = event.target.closest('[data-pick-job]');
    if (!button) return;
    $('#pfJob').value = button.dataset.pickJob;
    toast('已填为目标岗位，点击「保存并开始」生效');
  });

  $('#jobDetailBtn').addEventListener('click', () => {
    const profile = (app.state && app.state.profile) || {};
    openJobDetail(profile.targetJob || (app.state && app.state.job && app.state.job.name));
  });
  $('#jobPick').addEventListener('click', pickJob);
  $('#jobDetailClose').addEventListener('click', closeJobModal);

  $('#feedbackBtn').addEventListener('click', openFeedback);
  $('#fbCancel').addEventListener('click', () => $('#feedbackModal').classList.add('hidden'));
  $('#fbSubmit').addEventListener('click', submitFeedback);

  $('#stars').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-score]');
    if (!button) return;
    app.feedbackScore = Number(button.dataset.score);
    document.querySelectorAll('#stars button').forEach((item) => {
      item.classList.toggle('active', Number(item.dataset.score) <= app.feedbackScore);
    });
  });

  ['profileModal', 'feedbackModal', 'jobModal'].forEach((id) => {
    document.getElementById(id).addEventListener('click', (event) => {
      if (event.target.id === id) event.target.classList.add('hidden');
    });
  });
}

async function init() {
  bindEvents();
  updateComposer();
  const saved = loadLocal();
  try {
    const [meta, stateResponse] = await Promise.all([api('/api/meta'), api('/api/state')]);
    app.meta = meta;
    app.state = stateResponse.state;

    if (isEmptyProfile(app.state.profile) && saved.profile && !isEmptyProfile(saved.profile)) {
      const data = await api('/api/profile', { method: 'PUT', body: saved.profile });
      app.state = data.state;
    }
    if (!isEmptyProfile(app.state.profile)) {
      saveLocal({ profile: app.state.profile });
    }
    if (saved.mode && availableModes().includes(saved.mode)) {
      app.mode = saved.mode;
    }
    normalizeMode();
    renderAll();
    if (isEmptyProfile(app.state.profile)) {
      openProfileModal();
    } else {
      ensureStarted();
    }
  } catch (error) {
    $('#offlineBanner').classList.remove('hidden');
    $('#offlineBanner').textContent =
      '连接不到本地服务：请在项目目录运行 node server.js，看到启动提示后再刷新本页。';
    toast('初始化失败：' + error.message, 5000);
  }
}

document.addEventListener('DOMContentLoaded', init);