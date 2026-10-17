import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, BookOpen, CheckCircle2, Clock, Search } from 'lucide-react';
import { getModules, getLessons, learningStages } from '../../content';
import { useLearningService } from '../../hooks/useFeatureServices';
import { useServiceQuery } from '../../hooks/useServiceQuery';
import type { CourseProgress as Progress } from '../../types';
import { Card, PageHeading, Tag } from '../../shared/ui';
import { useState } from 'react';
export function LearningCatalog() {
  const modules = getModules();
  const publishedModules = modules.filter((module) => getLessons(module.id).length > 0);
  const learningService = useLearningService();
  const [params] = useSearchParams();
  const [filter, setFilter] = useState(params.get('module') ?? 'all');
  const [search, setSearch] = useState('');
  const progress = useServiceQuery(() => learningService.listProgress(), learningService);
  return (
    <>
      <PageHeading
        eyebrow="CHARISMA ACADEMY"
        title="魅力学院"
        description="十二个能力维度，一套循序渐进的学习方法。把理解变成生活里的行动。"
      />
      <div className="method-strip">
        {learningStages.map((stage, i) => (
          <span key={stage.label}>
            <b>0{i + 1}</b>
            {stage.catalogLabel}
            {i < learningStages.length - 1 && <ArrowRight size={14} />}
          </span>
        ))}
      </div>
      <div className="filter-toolbar">
        <div className="segmented">
          <button className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>
            所有维度
          </button>
          {publishedModules.map((module) => (
            <button
              key={module.id}
              className={filter === module.id ? 'selected' : ''}
              onClick={() => setFilter(module.id)}
            >
              正式课程 · {module.id}
            </button>
          ))}
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
            const formal = getLessons(m.id);
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
