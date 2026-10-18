import { useState } from 'react';
import { ArrowRight, MessagesSquare, RotateCcw } from 'lucide-react';
import { getModule, getScenarios } from '../../content';
import type { Scenario } from '../../types';
import { useScenarioService } from '../../hooks/useFeatureServices';
import { useServiceQueryState } from '../../hooks/useServiceQuery';
import { useFeedback } from '../../shared/feedback';
import { Card, PageHeading, Tag, SectionTitle } from '../../shared/ui';
export function ScenarioPractice() {
  const scenarios = getScenarios();
  const scenarioService = useScenarioService();
  const [active, setActive] = useState<Scenario | null>(null);
  const { data: history, loading } = useServiceQueryState(
    () => scenarioService.listAttempts(),
    scenarioService,
  );
  return (
    <>
      <PageHeading
        eyebrow="SCENARIO LAB"
        title="情景模拟剧场"
        description="在安全的练习空间，试试不同表达。理解情境与边界，找到适合自己的方式。"
      />
      {active ? (
        <ScenarioPlayer key={active.id} scenario={active} onClose={() => setActive(null)} />
      ) : (
        <div className="scenario-grid">
          {scenarios.map((s, i) => (
            <Card key={s.id} className="scenario-card">
              <div className="scenario-art">
                <MessagesSquare size={45} />
                <span>SCENARIO 0{i + 1}</span>
              </div>
              <Tag>
                {s.moduleId} · {getModule(s.moduleId)?.shortTitle ?? '情景练习'}
              </Tag>
              <h2>{s.title}</h2>
              <p>{s.background}</p>
              <button className="button" onClick={() => setActive(s)}>
                进入场景
                <ArrowRight size={16} />
              </button>
            </Card>
          ))}
        </div>
      )}
      <SectionTitle title="我的练习与反思" />
      {loading ? (
        <p className="muted" role="status">
          正在读取情景练习记录…
        </p>
      ) : history.length ? (
        history.map((r) => {
          const p = r.payload as { scenarioId: string; path: string[]; reflection: string };
          return (
            <Card key={r.id} className="scenario-history">
              <h3>{scenarios.find((s) => s.id === p.scenarioId)?.title ?? p.scenarioId}</h3>
              <span className="small muted">
                {new Date(r.createdAt).toLocaleString('zh-CN')} · {p.path.length} 次选择
              </span>
              <p>{p.reflection || '本次场景练习已保存。'}</p>
            </Card>
          );
        })
      ) : (
        <p className="muted">完成一个情景后，你的选择路径和反思会保存在本机。</p>
      )}
    </>
  );
}
function ScenarioPlayer({ scenario, onClose }: { scenario: Scenario; onClose: () => void }) {
  const scenarioService = useScenarioService();
  const [nodeId, setNode] = useState('start');
  const [choice, setChoice] = useState<number | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const [reflection, setReflection] = useState('');
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const { perform } = useFeedback();
  const node = scenario.nodes.find((n) => n.id === nodeId)!;
  const selected = choice === null ? null : node.options[choice];
  function reset() {
    setNode('start');
    setChoice(null);
    setPath([]);
    setReflection('');
    setFinished(false);
    setSaved(false);
  }
  return (
    <Card className="scenario-player">
      <div className="section-title">
        <h2>{scenario.title}</h2>
        <button className="text-button" onClick={onClose}>
          返回情景列表
        </button>
      </div>
      <div className="learning-note">
        <strong>背景与关系</strong>
        <p>{scenario.background}</p>
      </div>
      {!finished ? (
        <>
          <blockquote className="dialogue">{node.dialogue}</blockquote>
          <div className="scenario-options">
            {node.options.map((o, i) => (
              <button
                disabled={choice !== null}
                className={choice === i ? 'selected' : ''}
                key={o.text}
                onClick={() => {
                  setChoice(i);
                  setPath([...path, `${node.id}:${i}`]);
                }}
              >
                <span>{String.fromCharCode(65 + i)}</span>
                {o.text}
              </button>
            ))}
          </div>
          {selected && (
            <div className="scenario-feedback">
              <span className="eyebrow">表达解析</span>
              <p>{selected.feedback}</p>
              <strong>其他可行的方式</strong>
              <p>{selected.alternative}</p>
              <button
                className="button"
                onClick={() => {
                  if (selected.next) {
                    setNode(selected.next);
                    setChoice(null);
                  } else setFinished(true);
                }}
              >
                {selected.next ? '继续对话' : '进入复盘'}
                <ArrowRight size={16} />
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="scenario-reflection">
          <h3>把这次练习留给自己</h3>
          <p>本次完成 {path.length} 次选择。你发现了什么？现实里，你愿意尝试哪个表达？</p>
          <label>
            场景反思
            <textarea
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              maxLength={20000}
              placeholder="我想提醒自己…"
            />
          </label>
          <button
            className="button"
            disabled={saving || saved}
            onClick={async () => {
              setSaving(true);
              if (
                await perform(() =>
                  scenarioService.saveAttempt({ scenarioId: scenario.id, path, reflection }),
                )
              )
                setSaved(true);
              setSaving(false);
            }}
          >
            {saved ? '练习已保存到本机' : '保存练习结果'}
          </button>
        </div>
      )}
      <button
        className="text-button reset-scenario"
        onClick={() => {
          if (confirm('重新练习这个情景？尚未保存的选择将被重置。')) reset();
        }}
      >
        <RotateCcw size={15} />
        重新练习
      </button>
    </Card>
  );
}
