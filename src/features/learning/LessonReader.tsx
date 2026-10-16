import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Bookmark, CheckCircle2, Clock } from 'lucide-react';
import { lessons, scenarios } from '../../content';
import { useRepository } from '../../hooks/useRepository';
import { useRecords } from '../../hooks/useRecords';
import { useSaveQueue } from '../../hooks/useSaveQueue';
import { useFeedback } from '../../shared/feedback';
import type { CourseProgress as Progress, LessonNote as Note } from '../../types';
import { saveLessonProgress, saveLessonNote } from './learningService';
import { Card, Tag } from '../../shared/ui';
import { flushAllSaves, hasUnsavedChanges } from '../../services/saveCoordinator';
const stages = ['认识概念', '案例解析', '场景模拟', '现实训练', '测试与复盘'];
export function LessonReader() {
  const { lessonId } = useParams();
  const lesson = lessons.find((l) => l.id === lessonId);
  return lesson ? (
    <LessonContent key={lesson.id} lessonId={lesson.id} />
  ) : (
    <>
      <h1>课程尚未开放</h1>
      <Link to="/academy">回到学院</Link>
    </>
  );
}
function LessonContent({ lessonId }: { lessonId: string }) {
  const repository = useRepository();
  const lesson = lessons.find((l) => l.id === lessonId)!;
  const progress = useRecords('courseProgress');
  const notes = useRecords('lessonNote');
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const current = progress.find((p) => (p.payload as Progress).lessonId === lessonId);
  const lessonNotes = notes.filter((record) => (record.payload as Note).lessonId === lessonId);
  const note = activeNoteId
    ? lessonNotes.find((record) => record.id === activeNoteId)
    : lessonNotes[0];
  const progressId = useRef(crypto.randomUUID());
  const noteId = useRef(crypto.randomUUID());
  const [localStage, setLocalStage] = useState<number | null>(null);
  const stage = localStage ?? (current?.payload as Progress | undefined)?.stage ?? 0;
  const [text, setText] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [graded, setGraded] = useState(false);
  const { notify } = useFeedback();
  const { enqueue, state } = useSaveQueue();
  const data = (current?.payload as Progress | undefined) ?? {
    lessonId,
    stage: 0,
    completed: false,
  };
  const noteData = (note?.payload as Note | undefined) ?? { lessonId, text: '', bookmarked: false };
  const shownNoteVersion = useRef(note?.serverVersion);
  useEffect(() => {
    if (
      note?.serverVersion !== shownNoteVersion.current &&
      note?.syncStatus === 'synced' &&
      !hasUnsavedChanges()
    ) {
      shownNoteVersion.current = note.serverVersion;
      setText(null);
    }
  }, [note]);
  function writeProgress(patch: Partial<Progress>) {
    return saveLessonProgress(repository, lessonId, patch, progressId.current);
  }
  function writeNote(patch: Partial<Note>, toggleBookmark = false) {
    return saveLessonNote(
      repository,
      lessonId,
      patch,
      noteId.current,
      activeNoteId,
      toggleBookmark,
    );
  }
  async function changeStage(n: number) {
    setLocalStage(n);
    await enqueue(() => writeProgress({ stage: n }));
  }
  return (
    <>
      <Link to="/academy" className="back-link">
        <ArrowLeft size={15} />
        返回魅力学院
      </Link>
      <div className="lesson-heading">
        <div>
          <Tag>M04 · 谈吐与高级表达</Tag>
          <h1>{lesson.title}</h1>
          <p>{lesson.subtitle}</p>
          <span className="small muted">
            <Clock size={14} />
            预计 {lesson.minutes} 分钟 · 五阶段学习
          </span>
        </div>
        <button
          className={`button secondary ${noteData.bookmarked ? 'bookmarked' : ''}`}
          onClick={() => void enqueue(() => writeNote({}, true))}
        >
          <Bookmark size={16} />
          {noteData.bookmarked ? '已收藏' : '收藏课程'}
        </button>
      </div>
      <div className="lesson-layout">
        <div>
          <nav className="lesson-tabs" aria-label="课程阶段">
            {stages.map((s, i) => (
              <button
                className={stage === i ? 'active' : ''}
                key={s}
                onClick={() => void changeStage(i)}
              >
                <span>{i + 1}</span>
                {s}
              </button>
            ))}
          </nav>
          <Card className="lesson-body">
            {stage === 0 && (
              <>
                <div className="eyebrow">CONCEPT · 认识概念</div>
                <h2>这节课，你会学到</h2>
                <ul className="check-list">
                  {lesson.objectives.map((o) => (
                    <li key={o}>
                      <CheckCircle2 size={16} />
                      {o}
                    </li>
                  ))}
                </ul>
                {lesson.concepts.map((c) => (
                  <article key={c.title}>
                    <h3>{c.title}</h3>
                    <p>{c.body}</p>
                  </article>
                ))}
                <aside className="learning-note">
                  <strong>常见误区</strong>
                  <ul>
                    {lesson.mistakes.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </aside>
              </>
            )}
            {stage === 1 && (
              <>
                <div className="eyebrow">CASE · 案例解析</div>
                <h2>在真实生活里，表达有什么不同？</h2>
                {lesson.cases.map((c) => (
                  <article key={c.title}>
                    <h3>{c.title}</h3>
                    <div className="case before">
                      <span>调整前</span>
                      <p>{c.before}</p>
                    </div>
                    <div className="case after">
                      <span>另一种表达</span>
                      <p>{c.after}</p>
                    </div>
                    <p>{c.analysis}</p>
                  </article>
                ))}
              </>
            )}
            {stage === 2 && (
              <>
                <div className="eyebrow">SIMULATION · 场景模拟</div>
                <h2>换一个表达，会发生什么？</h2>
                <p>
                  到情景剧场试试不同的回应。每个选项都有反馈与替代表达，没有一套适用于所有人的社交套路。
                </p>
                {scenarios
                  .filter((s) => s.moduleId === lesson.moduleId)
                  .map((s) => (
                    <Link key={s.id} className="scenario-short" to="/scenarios">
                      <strong>{s.title}</strong>
                      <ArrowUpRightIcon />
                    </Link>
                  ))}
                <p className="muted">练习后返回本课，继续现实训练与复盘。</p>
              </>
            )}
            {stage === 3 && (
              <>
                <div className="eyebrow">PRACTICE · 现实训练</div>
                <h2>把这一课带到生活里</h2>
                <ol className="practice-steps">
                  {lesson.practice.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ol>
                <Link className="button" to="/training">
                  去训练营记录练习
                  <ArrowRight size={15} />
                </Link>
              </>
            )}
            {stage === 4 && (
              <>
                <div className="eyebrow">REFLECTION · 理解检测</div>
                <h2>检验理解，也听听自己的感受</h2>
                {lesson.quiz.map((q, i) => (
                  <fieldset className="quiz-question" key={q.id}>
                    <legend>
                      {i + 1}. {q.question}
                    </legend>
                    {q.options.map((o, index) => (
                      <label key={o} className={answers[q.id] === index ? 'selected' : ''}>
                        <input
                          type="radio"
                          name={q.id}
                          checked={answers[q.id] === index}
                          onChange={() => {
                            setAnswers({ ...answers, [q.id]: index });
                            setGraded(false);
                          }}
                        />
                        {o}
                      </label>
                    ))}
                    {graded && (
                      <p className={`quiz-feedback ${answers[q.id] === q.answer ? 'correct' : ''}`}>
                        {answers[q.id] === q.answer ? '理解正确。' : '可以再想一想。'}
                        {q.explanation}
                      </p>
                    )}
                  </fieldset>
                ))}
                <button
                  className="button"
                  disabled={Object.keys(answers).length !== lesson.quiz.length}
                  onClick={async () => {
                    const score = Math.round(
                      (lesson.quiz.filter((q) => answers[q.id] === q.answer).length /
                        lesson.quiz.length) *
                        100,
                    );
                    await enqueue(async () => {
                      await writeProgress({ stage: 4, completed: true, quizScore: score });
                      setGraded(true);
                      notify(`已保存到本机 · 理解检测 ${score}%`);
                    });
                  }}
                >
                  <CheckCircle2 size={16} />
                  提交测验并完成课程
                </button>
                {data.completed && (
                  <p className="small green-text">本课程已完成 · 上次测验 {data.quizScore}%</p>
                )}
              </>
            )}
            <div className="lesson-bottom">
              <button
                className="button secondary"
                disabled={stage === 0}
                onClick={() => void changeStage(stage - 1)}
              >
                上一步
              </button>
              <span>{stage + 1} / 5</span>
              <button
                className="button"
                disabled={stage === 4}
                onClick={() => void changeStage(stage + 1)}
              >
                下一阶段
                <ArrowRight size={15} />
              </button>
            </div>
          </Card>
        </div>
        <Card className="lesson-notes">
          <div className="section-title">
            <h2>我的学习笔记</h2>
            <NotebookIcon />
          </div>
          <p className="small muted">写下一个触动你的小发现。</p>
          {lessonNotes.length > 1 && (
            <label>
              笔记版本
              <select
                value={note?.id ?? ''}
                onChange={async (event) => {
                  const nextId = event.target.value;
                  const saved = await flushAllSaves();
                  if (saved) {
                    setActiveNoteId(nextId);
                    setText(null);
                  }
                }}
              >
                {lessonNotes.map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.importedCopyOf ? '导入副本' : '当前笔记'} ·{' '}
                    {new Date(record.updatedAt).toLocaleString('zh-CN')}
                  </option>
                ))}
              </select>
            </label>
          )}
          <textarea
            aria-label="学习笔记"
            placeholder="我想在生活里尝试…"
            value={text ?? noteData.text}
            maxLength={20000}
            onChange={(e) => {
              const value = e.target.value;
              setText(value);
              void enqueue(() => writeNote({ text: value }));
            }}
          />
          <button
            className="text-button"
            onClick={() => void enqueue(() => writeNote({ text: text ?? noteData.text }))}
          >
            重试保存
          </button>
          <span className="save-state">{state}</span>
          <div className="learning-tip">
            把知识变成自己的语言。
            <br />
            笔记默认私密，随课程记录在本机。
          </div>
        </Card>
      </div>
    </>
  );
}
import { ArrowUpRight, NotebookPen } from 'lucide-react';
function ArrowUpRightIcon() {
  return <ArrowUpRight size={17} />;
}
function NotebookIcon() {
  return <NotebookPen size={17} />;
}
