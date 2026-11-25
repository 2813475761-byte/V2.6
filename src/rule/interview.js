'use strict';

const { completeness } = require('../repo/resume');

const MAX_ROUNDS = 6;

function buildQuestions(ctx) {
  const { resume, job } = ctx;
  const questions = ['先用一分钟做个自我介绍，重点讲和目标岗位最相关的经历。'];
  const project = (resume.projects || []).find((item) => item.name);
  if (project) {
    questions.push(`简历里写了「${project.name}」，你在其中具体负责哪一部分？`);
    questions.push(`这个项目里最难解决的一个问题是什么？你是怎么处理的？`);
  } else {
    questions.push('讲一个你独立完成的作品或课程设计，你负责什么、最后结果如何？');
    questions.push('这个作品里遇到的最大困难是什么？你当时怎么解决的？');
  }
  const focuses = job.interviewFocus || [];
  if (focuses[0]) questions.push(`${focuses[0]}，结合你的经历说说。`);
  if (focuses[1]) questions.push(`${focuses[1]}，你会怎么处理？`);
  questions.push('最后，说说你未来一年的学习或职业规划。');
  return questions.slice(0, MAX_ROUNDS);
}

function evaluateAnswer(answer) {
  const text = String(answer || '');
  const length = text.replace(/\s/g, '').length;
  const hasNumber = /\d/.test(text);
  const hasStar = /(背景|负责|行动|结果|提升|上线|完成|解决)/.test(text);
  if (length < 15) return '回答比较简短，面试官很难判断你的真实贡献，建议补充「你做了什么 + 结果如何」。';
  if (!hasStar) return '内容有了，但结构还可以更清楚，建议按「背景-任务-行动-结果」展开。';
  if (!hasNumber) return '表达不错，如果能量化结果（人数、性能、效率、奖项）会更有说服力。';
  return '回答结构清楚、有细节，继续保持。';
}

function scoreInterview(rounds, resume, job) {
  const answered = rounds.filter((round) => round.answer && round.answer.trim());
  const texts = answered.map((round) => round.answer.trim());
  const completenessScore = Math.round((answered.length / MAX_ROUNDS) * 100);
  const starRatio = texts.length
    ? texts.filter((text) => /(背景|负责|行动|结果|提升|上线|完成|解决)/.test(text)).length / texts.length
    : 0;
  const numberRatio = texts.length ? texts.filter((text) => /\d/.test(text)).length / texts.length : 0;
  const structureScore = Math.round((starRatio * 0.6 + numberRatio * 0.4) * 100);
  const avgLength = texts.length ? texts.reduce((sum, text) => sum + text.replace(/\s/g, '').length, 0) / texts.length : 0;
  const expressionScore = Math.max(30, Math.min(95, Math.round(60 + Math.min(30, avgLength / 3))));
  const resumeScore = completeness(resume);
  const matchScore = Math.round(resumeScore * 0.6 + structureScore * 0.4);
  const overall = Math.round(
    completenessScore * 0.2 + structureScore * 0.3 + matchScore * 0.3 + expressionScore * 0.2
  );
  return {
    overall,
    dimensions: [
      {
        name: '完整度',
        score: completenessScore,
        comment: `完成 ${answered.length}/${MAX_ROUNDS} 轮问答，${answered.length >= MAX_ROUNDS ? '全程参与，态度积极' : '有几轮回答缺失'}`
      },
      {
        name: '结构表达',
        score: structureScore,
        comment: numberRatio > 0.5 ? '结果有量化，结构较清晰' : '建议多用 STAR 结构并补充量化结果'
      },
      {
        name: '岗位匹配',
        score: matchScore,
        comment: `简历完成度 ${resumeScore}%，与「${job.name}」的核心要求${
          matchScore >= 70 ? '匹配度较高' : '还有提升空间'
        }`
      },
      {
        name: '沟通表达',
        score: expressionScore,
        comment: avgLength >= 60 ? '回答信息量合适' : '回答偏短，可以再展开一些细节'
      }
    ],
    summary:
      overall >= 80
        ? '整体表现不错，继续保持结构化表达，面试前再熟悉一遍项目细节。'
        : overall >= 60
        ? '基础表现达标，重点补强量化结果和岗位专业问题，多练两轮会更稳。'
        : '目前回答偏简略，建议先把简历中的项目按 STAR 梳理清楚，再进行下一轮模拟。'
  };
}

function run(ctx) {
  const { resume, job, interview, userMessage } = ctx;
  const rounds = ((interview && interview.rounds) || []).map((round) => ({ ...round }));
  const questions = buildQuestions({ resume, job });

  if (userMessage) {
    const last = rounds[rounds.length - 1];
    if (last && !last.answer) {
      last.answer = String(userMessage);
      last.feedback = evaluateAnswer(userMessage);
    }
  }

  if (rounds.length >= MAX_ROUNDS) {
    const score = scoreInterview(rounds, resume, job);
    return {
      reply: `面试到这里，感谢你的时间。${score.summary}`,
      nextQuestion: '',
      interviewPatch: { rounds, score, status: 'finished' },
      progress: { round: rounds.length, done: true },
      suggestions: ['看看评分详情', '回到简历继续打磨']
    };
  }

  const nextQuestion = questions[rounds.length] || '还有什么想补充的吗？';
  rounds.push({ question: nextQuestion, answer: '', feedback: '', dimension: '' });
  const lastAnswer = rounds.length >= 2 ? rounds[rounds.length - 2] : null;
  const reply = lastAnswer && lastAnswer.feedback ? lastAnswer.feedback : '我们开始吧，放轻松，像聊天一样回答就好。';

  return {
    reply,
    nextQuestion,
    interviewPatch: { rounds, status: 'active' },
    progress: { round: rounds.length, done: false },
    suggestions: rounds.length === 1 ? ['好的，我准备好了'] : []
  };
}

module.exports = { run, buildQuestions, scoreInterview, evaluateAnswer, MAX_ROUNDS };