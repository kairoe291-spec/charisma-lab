import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Clock,
  Flame,
  MessageCircle,
  NotebookPen,
  Sprout,
  Target,
} from 'lucide-react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  Tooltip,
} from 'recharts';
import { modules, lessons, trainings } from '../../content';
import { useDashboard } from './useDashboard';
import { Card, SectionTitle, Tag } from '../../shared/ui';
import type { UserProfile as Profile, JournalEntry as Journal } from '../../types';
import { today, shortDate } from '../../utils/files';
export function GrowthDashboard({ profile, percent }: { profile?: Profile; percent: number }) {
  const [radarMode, setRadarMode] = useState<'self' | 'knowledge' | 'practice'>('self');
  const {
    complete,
    records,
    todayTasks,
    minutes,
    latest,
    radar,
    week,
    streak,
    next,
    focus,
    journals,
    assessments,
  } = useDashboard(profile, radarMode);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR PERSONAL GROWTH LAB</div>
          <h1>
            {profile?.name ? `${profile.name}，让成长成为日常。` : '让成长，成为日常。'}
            <Sprout size={28} />
          </h1>
          <p>不必一夜改变。今天的一点练习，会成为明天的从容。</p>
        </div>
        <Link to="/journal" className="button secondary">
          <NotebookPen size={16} />
          写一篇复盘
        </Link>
      </div>
      <div className="dashboard-top">
        <section className="hero">
          <div className="hero-content">
            <div className="hero-kicker">
              <span className="hero-dot" /> 我的成长计划 <span>·</span> 自主安排节奏
            </div>
            <h2>
              每一个小行动，
              <br />
              都在塑造更好的你。
            </h2>
            <p>{profile?.goal ?? '认识自己，练习表达，建立真实而平等的联结。'}</p>
            <div className="hero-actions">
              <Link className="button cream" to={'/academy/' + next.id}>
                继续学习
                <ArrowRight size={17} />
              </Link>
              <span>
                {profile?.dailyMinutes ?? 15} 分钟 / 天 · 每周 {profile?.weeklyDays ?? 5} 天
              </span>
            </div>
          </div>
          <div className="growth-orbit">
            <div className="orbit outer" />
            <div className="orbit inner" />
            <div className="orbit-center">
              <Sprout size={45} />
              <span>GROW AT YOUR PACE</span>
            </div>
            <div className="orbit-point p1">
              <BookOpen size={20} />
            </div>
            <div className="orbit-point p2">
              <MessageCircle size={20} />
            </div>
            <div className="orbit-point p3">
              <Check size={20} />
            </div>
            <div className="orbit-caption">认识 · 练习 · 生长</div>
          </div>
        </section>
        <Card className="today-card">
          <div className="section-title">
            <h2>今日的小目标</h2>
            <Tag>轻量开始</Tag>
          </div>
          <p className="small muted">{today().replaceAll('-', ' / ')} · 每一步都算数</p>
          <Link to={'/academy/' + next.id} className="today-task">
            <span className={complete ? 'task-check checked' : 'task-check'}>
              <BookOpen size={17} />
            </span>
            <div>
              <strong>学习一节表达课程</strong>
              <span>
                {next.title} · {next.minutes} 分钟
              </span>
            </div>
            <ChevronArrow />
          </Link>
          <Link to="/training" className="today-task">
            <span className={`task-check ${todayTasks.length ? 'checked' : ''}`}>
              {todayTasks.length ? <Check size={17} /> : <Target size={17} />}
            </span>
            <div>
              <strong>{todayTasks.length ? '今天的训练已记录' : '完成一次现实练习'}</strong>
              <span>
                {trainings.find((t) => t.minutes === (profile?.dailyMinutes ?? 15))?.title ??
                  trainings[0]?.title}
              </span>
            </div>
            <ChevronArrow />
          </Link>
          <Link to="/journal" className="today-task">
            <span className="task-check">
              <NotebookPen size={17} />
            </span>
            <div>
              <strong>留下今天的一点感受</strong>
              <span>一个收获，或一个新发现</span>
            </div>
            <ChevronArrow />
          </Link>
        </Card>
      </div>
      <div className="stat-grid">
        {[
          {
            label: '课程完成',
            value: complete,
            suffix: `/ ${lessons.length}`,
            note: `正式课程完成率 ${percent}%`,
            icon: BookOpen,
          },
          {
            label: '现实训练',
            value: records.length,
            suffix: '次',
            note: '来自你的实际训练记录',
            icon: Target,
          },
          {
            label: '累计训练',
            value: minutes,
            suffix: '分钟',
            note: '每一次练习，都有意义',
            icon: Clock,
          },
          {
            label: '连续训练',
            value: streak,
            suffix: '天',
            note: '以实际训练日期计算',
            icon: Flame,
          },
        ].map((s) => (
          <Card className="stat" key={s.label}>
            <div>
              <span>{s.label}</span>
              <s.icon size={18} />
            </div>
            <strong>
              {s.value}
              <small>{s.suffix}</small>
            </strong>
            <p>{s.note}</p>
          </Card>
        ))}
      </div>
      <div className="dashboard-middle">
        <Card className="radar-card">
          <SectionTitle title="我的十二维成长画像" to="/assessment" label="更新自评" />
          <div className="segmented">
            {[
              ['self', '行为自评'],
              ['knowledge', '知识掌握'],
              ['practice', '训练完成'],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => setRadarMode(value as typeof radarMode)}
                className={radarMode === value ? 'selected' : ''}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="radar-container">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radar} outerRadius="70%">
                <PolarGrid stroke="var(--line)" />
                <PolarAngleAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar
                  dataKey="value"
                  stroke="var(--accent)"
                  fill="var(--accent)"
                  fillOpacity={0.16}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <p className="chart-explanation">
            {radarMode === 'self'
              ? latest
                ? '1–5 行为自评 × 20；用于个人反思，不代表人格价值。'
                : '尚未自评。完成 24 题后，显示你的第一份成长画像。'
              : radarMode === 'knowledge'
                ? '已完成课程测验的平均正确率；未测验维度显示 0。'
                : '该维度已完成训练次数 ÷ 3，上限 100%；用于记录实践频率。'}
          </p>
        </Card>
        <Card className="weekly-card">
          <SectionTitle title="这一周的练习" to="/training" label="训练记录" />
          <div className="weekly-summary">
            <strong>
              {week.reduce((a, d) => a + d.分钟, 0)}
              <small>分钟</small>
            </strong>
            <Tag>最近 7 天</Tag>
          </div>
          <div className="bar-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={week}>
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--muted)', fontSize: 12 }}
                />
                <Tooltip cursor={{ fill: 'var(--surface-alt)' }} />
                <Bar dataKey="分钟" fill="var(--accent)" radius={[5, 5, 0, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="weekly-note">
            <span className="note-icon">
              <Sprout size={19} />
            </span>
            <p>
              {records.length
                ? '记录真实的练习，让变化慢慢变得可见。'
                : '还没有训练记录？从 5 分钟的小练习开始。'}
              <Link to="/training">
                去练习 <ArrowUpRight size={13} />
              </Link>
            </p>
          </div>
        </Card>
      </div>
      <SectionTitle title="你正在关注的能力" to="/academy" label="探索 12 个维度" />
      <div className="focus-cards">
        {focus.map((id, i) => {
          const m = modules.find((m) => m.id === id)!;
          return (
            <Link key={id} className="card module-mini" to={'/academy?module=' + id}>
              <div className={`module-icon tone-${i}`}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                <ArrowUpRight size={19} />
              </div>
              <Tag>{id}</Tag>
              <h3>{m.title}</h3>
              <p>{m.description}</p>
              <div className="mini-footer">
                {lessons.filter((l) => l.moduleId === id).length
                  ? '3 节正式课程 · 可以开始'
                  : '课程目录已收录 · 内容待扩展'}
                <ArrowRight size={16} />
              </div>
            </Link>
          );
        })}
      </div>
      <div className="dashboard-bottom">
        <Card>
          <SectionTitle title="最近的复盘" to="/journal" />
          {journals.length ? (
            journals.slice(0, 2).map((r) => (
              <Link key={r.id} className="journal-preview" to={'/journal?entry=' + r.id}>
                <NotebookPen size={20} />
                <div>
                  <strong>{(r.payload as Journal).title}</strong>
                  <p>{(r.payload as Journal).body.slice(0, 90) || '留白也是思考的开始。'}</p>
                </div>
                <span>{shortDate(r.updatedAt)}</span>
              </Link>
            ))
          ) : (
            <div className="gentle-empty">
              <NotebookPen size={25} />
              <p>
                给今天留下一点记录。
                <br />
                <span>写下你注意到的变化，不需要写得完美。</span>
              </p>
              <Link to="/journal">
                开始记录
                <ArrowUpRight size={14} />
              </Link>
            </div>
          )}
        </Card>
        <Card className="quote-card">
          <span className="eyebrow">A LITTLE REMINDER</span>
          <blockquote>
            “成为自己，
            <br />
            是一场值得耐心的练习。”
          </blockquote>
          <p>
            {assessments.length
              ? '带着你的观察，继续下一次小实验。'
              : '不比较，不催促。让真实的经历告诉你方向。'}
          </p>
        </Card>
      </div>
    </>
  );
}
import { useState } from 'react';
function ChevronArrow() {
  return <ArrowUpRight size={15} className="muted" />;
}
