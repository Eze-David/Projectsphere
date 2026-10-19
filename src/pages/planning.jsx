import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Flag } from 'lucide-react';
import { AvatarStack, Empty } from '../components/ui.jsx';
import { formatDate, shortDate } from '../hooks.js';
import { slug, taskProgress, TODAY } from '../store.jsx';
import { TaskModal } from './tasks.jsx';

const dayNum = (iso) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86400000);
const isoOf = (d) => d.toLocaleDateString('en-CA');
const monthStart = (iso) => `${iso.slice(0, 7)}-01`;
const nextMonth = (iso) => {
  const [y, m] = iso.split('-').map(Number);
  return isoOf(new Date(y, m, 1));
};

/* ---------- Gantt ---------- */

export function GanttView() {
  const { project, api } = useOutletContext();
  const [editing, setEditing] = useState(null);
  const dated = project.tasks.filter((t) => t.start || t.due);

  if (dated.length === 0 && project.milestones.length === 0) {
    return <div className="page"><h1 className="page-title">Gantt</h1><Empty>Add start or due dates to tasks to see them on the Gantt chart.</Empty></div>;
  }

  const allDates = [...dated.flatMap((t) => [t.start, t.due].filter(Boolean)), ...project.milestones.map((m) => m.date), TODAY].sort();
  const months = [];
  for (let m = monthStart(allDates[0]); m <= allDates[allDates.length - 1]; m = nextMonth(m)) months.push(m);
  const start = dayNum(months[0]);
  const total = dayNum(nextMonth(months[months.length - 1])) - start;
  const pct = (days) => `${(days / total) * 100}%`;
  const at = (iso) => pct(dayNum(iso) - start);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Gantt</h1>
        <div className="legend">
          {['To do', 'In progress', 'In review', 'Done'].map((s) => <span key={s}><i className={`stage-${slug(s)}`} /> {s}</span>)}
          <span><Flag size={12} /> Milestone</span>
        </div>
      </div>

      <div className="gantt-wrap">
        <div className="gantt" style={{ '--months': months.length }}>
          <div className="g-row g-header">
            <div className="g-label">Task</div>
            <div className="g-track">
              {months.map((m) => (
                <span key={m} className="g-month" style={{ left: at(m), width: pct(dayNum(nextMonth(m)) - dayNum(m)) }}>
                  {formatDate(m, { month: 'short', year: '2-digit' })}
                </span>
              ))}
            </div>
          </div>

          {project.taskLists.map((list) => {
            const rows = dated.filter((t) => t.listId === list.id).sort((a, b) => (a.start || a.due).localeCompare(b.start || b.due));
            if (rows.length === 0) return null;
            return (
              <div key={list.id}>
                <div className="g-row g-group"><div className="g-label">{list.name}</div><div className="g-track" /></div>
                {rows.map((t) => {
                  const s = t.start || t.due;
                  const e = t.due || t.start;
                  return (
                    <div key={t.id} className="g-row">
                      <button className="g-label g-task" onClick={() => setEditing(t)}>
                        <span>{t.title}</span>
                        <AvatarStack names={t.assignees} max={2} />
                      </button>
                      <div className="g-track">
                        <button
                          className={`g-bar stage-${slug(t.status)}`}
                          style={{ left: at(s), width: pct(dayNum(e) - dayNum(s) + 1) }}
                          title={`${t.title}: ${shortDate(s)} – ${shortDate(e)} · ${taskProgress(t)}%`}
                          onClick={() => setEditing(t)}
                        >
                          <span className="g-fill" style={{ width: `${taskProgress(t)}%` }} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {project.milestones.length > 0 && (
            <>
              <div className="g-row g-group"><div className="g-label">Milestones</div><div className="g-track" /></div>
              {[...project.milestones].sort((a, b) => a.date.localeCompare(b.date)).map((m) => (
                <div key={m.id} className="g-row">
                  <div className="g-label"><span className={m.done ? 'done-text' : ''}>{m.name}</span><span className="meta">{shortDate(m.date)}</span></div>
                  <div className="g-track">
                    <span className={`g-diamond ${m.done ? 'done' : ''}`} style={{ left: at(m.date) }} title={`${m.name} · ${formatDate(m.date)}`} />
                  </div>
                </div>
              ))}
            </>
          )}

          <div className="g-today" style={{ left: `calc(var(--label-w) + (100% - var(--label-w)) * ${(dayNum(TODAY) - start) / total})` }} title="Today" />
        </div>
      </div>

      {editing && <TaskModal key={editing.id} project={project} api={api} task={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/* ---------- Calendar ---------- */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CalendarView() {
  const { project, api } = useOutletContext();
  const [cursor, setCursor] = useState(monthStart(TODAY));
  const [editing, setEditing] = useState(null);

  const [y, m] = cursor.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const weeks = Math.ceil((first.getDay() + new Date(y, m, 0).getDate()) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => isoOf(new Date(y, m - 1, 1 - first.getDay() + i)));
  const shift = (n) => setCursor(isoOf(new Date(y, m - 1 + n, 1)));

  return (
    <div className="page">
      <div className="page-head">
        <h1>{formatDate(cursor, { month: 'long', year: 'numeric' })}</h1>
        <div className="btn-row tight">
          <button className="btn btn-outline btn-sm" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={16} /></button>
          <button className="btn btn-outline btn-sm" onClick={() => setCursor(monthStart(TODAY))}>Today</button>
          <button className="btn btn-outline btn-sm" onClick={() => shift(1)} aria-label="Next month"><ChevronRight size={16} /></button>
        </div>
      </div>

      <div className="calendar">
        {WEEKDAYS.map((d) => <div key={d} className="cal-weekday">{d}</div>)}
        {days.map((d) => {
          const tasks = project.tasks.filter((t) => t.due === d);
          const milestones = project.milestones.filter((ms) => ms.date === d);
          return (
            <div key={d} className={`cal-day ${d.slice(0, 7) !== cursor.slice(0, 7) ? 'other' : ''} ${d === TODAY ? 'today' : ''}`}>
              <span className="cal-num">{Number(d.slice(8))}</span>
              {milestones.map((ms) => (
                <span key={ms.id} className="cal-item milestone" title={ms.name}><Flag size={11} /> {ms.name}</span>
              ))}
              {tasks.map((t) => (
                <button key={t.id} className={`cal-item stage-${slug(t.status)}`} title={t.title} onClick={() => setEditing(t)}>
                  {t.title}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {editing && <TaskModal key={editing.id} project={project} api={api} task={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
