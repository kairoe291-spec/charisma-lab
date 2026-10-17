import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Compass, Target } from 'lucide-react';
import { modules, selfAssessmentQuestions, selfAssessmentGuidance } from '../../content';
import { useAssessmentService } from '../../hooks/useFeatureServices';
import { useServiceQuery } from '../../hooks/useServiceQuery';
import { useRecords } from '../../hooks/useRecords';
import { useFeedback } from '../../shared/feedback';
import { Card, PageHeading, SectionTitle, Tag } from '../../shared/ui';
import type { UserProfile as Profile, TrainingRecord } from '../../types';
export function AssessmentWorkspace() {
  const assessmentService = useAssessmentService();
  const results = useServiceQuery(() => assessmentService.listResults(), assessmentService);
  const journals = useRecords('journalEntry');
  const training = useRecords('trainingRecord');
  const profiles = useRecords('profile');
  const profile = profiles[0]?.payload as Profile | undefined;
  const [started, setStarted] = useState(false);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const { perform } = useFeedback();
  const week = training.filter((record) => {
    const age =
      Date.now() - new Date((record.payload as TrainingRecord).date + 'T00:00:00').getTime();
    return age >= 0 && age < 7 * 86400000;
  });
  const scores = results.find(
    (record) => (record.payload as { type: string }).type === 'initial-self',
  )?.payload as { scores: Record<string, number> } | undefined;
  return (
    <>
      <PageHeading
        eyebrow="REFLECT & REORIENT"
        title="阶段测评与成长计划"
        description="观察具体的行为变化，理解自己的需要。分数用于自我反思，不定义你是谁。"
      />
      <Card className="assessment-intro">
        <span className="assessment-symbol">
          <Compass size={40} />
        </span>
        <div>
          <Tag>24 题 · 约 5 分钟</Tag>
          <h2>建立你的第一份行为自评</h2>
          <p>{selfAssessmentGuidance}</p>
          <button
            className="button"
            onClick={() => {
              setStarted(!started);
            }}
          >
            {started ? '收起测评' : '开始 / 再次自评'}
            <ArrowRight size={16} />
          </button>
        </div>
      </Card>
      {started && (
        <Card className="assessment-form">
          <div className="section-title">
            <h2>{modules[step].title}</h2>
            <span>{step + 1} / 12 个维度</span>
          </div>
          <div className="progress-track">
            <div style={{ width: `${((step + 1) / 12) * 100}%` }} />
          </div>
          {selfAssessmentQuestions.slice(step * 2, step * 2 + 2).map((q, i) => {
            const index = step * 2 + i;
            return (
              <fieldset className="self-question" key={index}>
                <legend>
                  {index + 1}. {q.question}
                </legend>
                <div className="scale-options">
                  {['几乎没有', '偶尔', '有时', '经常', '持续做到'].map((label, j) => (
                    <label className={answers[index] === j + 1 ? 'selected' : ''} key={label}>
                      <input
                        type="radio"
                        name={'self-' + index}
                        checked={answers[index] === j + 1}
                        onChange={() => setAnswers({ ...answers, [index]: j + 1 })}
                      />
                      <strong>{j + 1}</strong>
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
          <div className="lesson-bottom">
            <button
              className="button secondary"
              disabled={step === 0 || saving}
              onClick={() => setStep(step - 1)}
            >
              上一维度
            </button>
            {step < 11 ? (
              <button
                className="button"
                disabled={!answers[step * 2] || !answers[step * 2 + 1]}
                onClick={() => setStep(step + 1)}
              >
                下一维度
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                className="button"
                disabled={Object.keys(answers).length !== 24 || saving}
                onClick={async () => {
                  setSaving(true);
                  if (
                    await perform(
                      () => assessmentService.submitSelfAssessment(answers),
                      '自评已保存到本机 · 每维度为两道题的平均值',
                    )
                  ) {
                    setStarted(false);
                    setStep(0);
                    setAnswers({});
                  }
                  setSaving(false);
                }}
              >
                <CheckCircle2 size={16} />
                保存自评结果
              </button>
            )}
          </div>
        </Card>
      )}
      <div className="assessment-results">
        {scores ? (
          <>
            <SectionTitle title="最近一次行为自评" />
            <div className="score-grid">
              {modules.map((m) => (
                <Card key={m.id}>
                  <span>{m.shortTitle}</span>
                  <strong>
                    {scores.scores[m.id]?.toFixed(1) ?? '—'}
                    <small>/ 5</small>
                  </strong>
                </Card>
              ))}
            </div>
            <p className="small muted">
              评分依据：每维度 2 题，各选项为 1–5，取算术平均。没有“魅力总分”。
            </p>
          </>
        ) : (
          <div className="notice">还没有自评记录。你可以先学习，也可以先完成这份自评。</div>
        )}
      </div>
      <SectionTitle title="本周成长观察" />
      <Card className="weekly-reflection">
        <Target size={26} />
        <div>
          <h3>从事实开始复盘</h3>
          <p>
            最近 7 天，你记录了 {week.length} 次训练。成长档案共有 {journals.length} 篇记录。
          </p>
          <p className="muted">回想一个具体行动：做了什么？有什么变化？下周保留哪一个小习惯？</p>
        </div>
        <Link className="button secondary" to="/journal">
          写一篇周总结
        </Link>
      </Card>
      <SectionTitle title="你的 90 天建议路线" />
      <div className="plan-grid">
        {[
          { day: 'DAY 01—07', title: '认识自己', body: '观察现有习惯，完成自评，选三个关注维度。' },
          {
            day: 'DAY 08—30',
            title: '外在与表达',
            body: '探索舒适风格，练习从容表达与有分寸的幽默。',
          },
          { day: 'DAY 31—60', title: '向内扎根', body: '拓展知识，练习共情、心理韧性与现实能力。' },
          {
            day: 'DAY 61—90',
            title: '联结与整合',
            body: '尊重双向意愿，练习深度交流，发展生活兴趣。',
          },
        ].map((p) => (
          <Card key={p.day}>
            <span className="eyebrow">{p.day}</span>
            <h3>{p.title}</h3>
            <p>{p.body}</p>
          </Card>
        ))}
      </div>
      <p className="small muted">
        建议路线可以跳过或调整。你的当前目标：{profile?.goal ?? '尚未设置'}。30 / 90
        天专用评估与变化趋势将在 P3 扩展。
      </p>
      <SectionTitle title="自评历史" />
      {results.map((r) => (
        <Card key={r.id} className="assessment-history">
          <span>{new Date(r.createdAt).toLocaleString('zh-CN')}</span>
          <Tag>
            {(r.payload as { type: string }).type === 'initial-self'
              ? '24 题行为自评'
              : (r.payload as { type: string }).type}
          </Tag>
          <span className="small muted">真实已保存数据 · 可在设置导出 CSV</span>
        </Card>
      ))}
    </>
  );
}
