import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, BookOpen, CheckCircle2, Clock, Search } from 'lucide-react';
import { modules, lessons } from '../../content';
import { useRecords } from '../../hooks/useRecords';
import type { CourseProgress as Progress } from '../../types';
import { Card, PageHeading, Tag } from '../../shared/ui';
import { useState } from 'react';
export function LearningCatalog() {
  const [params] = useSearchParams();
  const [filter, setFilter] = useState(params.get('module') ?? 'all');
  const [search, setSearch] = useState('');
  const progress = useRecords('courseProgress');
  return (
    <>
      <PageHeading
        eyebrow="CHARISMA ACADEMY"
        title="魅力学院"
        description="十二个能力维度，一套循序渐进的学习方法。把理解变成生活里的行动。"
      />
      <div className="method-strip">
        {['认识概念', '分析案例', '场景模拟', '现实训练', '测试复盘'].map((t, i) => (
          <span key={t}>
            <b>0{i + 1}</b>
            {t}
            {i < 4 && <ArrowRight size={14} />}
          </span>
        ))}
      </div>
      <div className="filter-toolbar">
        <div className="segmented">
          <button className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>
            所有维度
          </button>
          <button className={filter === 'M04' ? 'selected' : ''} onClick={() => setFilter('M04')}>
            正式课程 · M04
          </button>
        </div>
        <label className="inline-search">
          <Search size={16} />
          <input
            aria-label="搜索课程目录"
            placeholder="搜索能力、课程…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="academy-grid">
        {modules
          .filter(
            (m) =>
              (filter === 'all' || m.id === filter) &&
              (!search || [m.title, ...m.topics, ...m.plannedLessons].join('').includes(search)),
          )
          .map((m) => {
            const formal = lessons.filter((l) => l.moduleId === m.id);
            return (
              <Card key={m.id} className="academy-module">
                <div className="module-heading">
                  <span className="module-number">{m.id.slice(1)}</span>
                  <Tag color={formal.length ? 'green' : ''}>
                    {formal.length ? '示范模块 · 已开放' : '真实目录 · 待扩展'}
                  </Tag>
                </div>
                <h2>{m.title}</h2>
                <p>{m.description}</p>
                <div className="topic-tags">
                  {m.topics.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
                <div className="course-list">
                  {formal.length
                    ? formal.map((l) => {
                        const p = progress.find((p) => (p.payload as Progress).lessonId === l.id)
                          ?.payload as Progress | undefined;
                        return (
                          <Link key={l.id} to={'/academy/' + l.id}>
                            <span>
                              {p?.completed ? <CheckCircle2 size={17} /> : <BookOpen size={17} />}
                            </span>
                            <div>
                              <strong>{l.title}</strong>
                              <small>
                                <Clock size={11} /> {l.minutes} 分钟 ·{' '}
                                {p?.completed ? '已完成' : p ? '继续学习' : '入门课程'}
                              </small>
                            </div>
                            <ArrowRight size={15} />
                          </Link>
                        );
                      })
                    : m.plannedLessons.map((title, i) => (
                        <div key={title} className="planned-course">
                          <span>0{i + 1}</span>
                          {title}
                        </div>
                      ))}
                </div>
                {!formal.length && (
                  <p className="small muted">已规划教学主题。本阶段尚无正式课文与测验。</p>
                )}
              </Card>
            );
          })}
      </div>
    </>
  );
}
