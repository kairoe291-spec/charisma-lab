import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Compass, Target } from 'lucide-react';
import {
  growthPlan,
  modules,
  selfAssessmentQuestions,
  selfAssessmentGuidance,
  selfAssessmentScale,
} from '../../content';
import { useAssessmentService } from '../../hooks/useFeatureServices';
import { useServiceQueryState } from '../../hooks/useServiceQuery';
import { useRecordsState } from '../../hooks/useRecords';
import { useFeedback } from '../../shared/feedback';
import { Card, PageHeading, SectionTitle, Tag } from '../../shared/ui';
import type { UserProfile as Profile, TrainingRecord } from '../../types';
export function AssessmentWorkspace() {
  const assessmentService = useAssessmentService();
  const { data: results, loading: resultsLoading } = useServiceQueryState(
    () => assessmentService.listResults(),
    assessmentService,
  );
  const { data: journals, loading: journalsLoading } = useRecordsState('journalEntry');
  const { data: training, loading: trainingLoading } = useRecordsState('trainingRecord');
  const { data: profiles, loading: profilesLoading } = useRecordsState('profile');
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
                  {selfAssessmentScale.map((label, j) => (
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
        {resultsLoading ? (
          <p className="muted" role="status">
            正在读取自评记录…
          </p>
        ) : scores ? (
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
            {trainingLoading || journalsLoading
              ? '正在读取本周训练与成长档案…'
              : `最近 7 天，你记录了 ${week.length} 次训练。成长档案共有 ${journals.length} 篇记录。`}
          </p>
          <p className="muted">回想一个具体行动：做了什么？有什么变化？下周保留哪一个小习惯？</p>
        </div>
        <Link className="button secondary" to="/journal">
          写一篇周总结
        </Link>
      </Card>
      <SectionTitle title="你的 90 天建议路线" />
      <div className="plan-grid">
        {growthPlan.map((p) => (
          <Card key={p.day}>
            <span className="eyebrow">{p.day}</span>
            <h3>{p.title}</h3>
            <p>{p.body}</p>
          </Card>
        ))}
      </div>
      <p className="small muted">
        建议路线可以跳过或调整。你的当前目标：
        {profilesLoading ? '正在读取…' : (profile?.goal ?? '尚未设置')}。30 / 90
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
