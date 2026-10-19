import { useState } from 'react';
import { useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import {
  Calendar, ChevronDown, Flag, Hash, Kanban, ListChecks, MessageCircle, Plus, Table, TrendingUp, Users,
} from 'lucide-react';
import { Avatar, AvatarStack, Dropdown, Empty, Modal } from '../components/ui.jsx';
import { AttachmentBadge, Attachments, uploadPending } from '../components/Attachments.jsx';
import { formatDate, matchesQuery, shortDate, useLocalStorage } from '../hooks.js';
import { LABELS, PRIORITIES, TASK_STATUSES } from '../data/projects.js';
import { access, isOverdue, projectPeople, slug, STAGE_PROGRESS, statusClass, taskProgress, useStore } from '../store.jsx';

// Task permissions (the database enforces the same rules):
// details — owners/project managers ("edit all"), or the task's creator; stage, hours, comments — also assignees.
export function taskRights(project, userId, myName, task) {
  const level = access(project, userId, 'tasks');
  const details = !task.id ? level >= 3 : level >= 4 || (level >= 3 && task.createdBy === userId);
  const assigned = (task.assignees ?? []).includes(myName);
  return { level, details, stage: details || (level >= 2 && assigned) };
}

const labelColor = (name) => LABELS.find((l) => l.name === name)?.color ?? '#64748b';

export function Labels({ labels }) {
  if (!labels.length) return null;
  return (
    <div className="labels">
      {labels.map((l) => <span key={l} className="label" style={{ background: labelColor(l) }}>{l}</span>)}
    </div>
  );
}

export function PriorityFlag({ priority }) {
  return (
    <span className={`priority-flag priority-${slug(priority || 'Medium')}`} title={`${priority} priority`}>
      <Flag size={13} />
    </span>
  );
}

/* ---------- Board / table ---------- */

export function TasksView() {
  const { project, api, openAddList } = useOutletContext();
  const { user, me } = useStore();
  const level = access(project, user.id, 'tasks'); // 1 view · 2 assigned only · 3 create, edit own · 4 edit all
  const { listId } = useParams();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useLocalStorage('bh-task-view', 'Board');
  const [query, setQuery] = useState('');
  const [assignee, setAssignee] = useState('');
  const [draft, setDraft] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null);

  const list = project.taskLists.find((l) => l.id === listId);
  const people = [...new Set([...projectPeople(project), ...project.tasks.flatMap((t) => t.assignees)])];

  // A task can be opened from elsewhere (search, My tasks) via ?task=<id>.
  const linked = project.tasks.find((t) => t.id === params.get('task'));
  const editing = draft ?? linked ?? null;
  const closeTask = () => {
    setDraft(null);
    if (params.get('task')) setParams({}, { replace: true });
  };
  const newTask = (status = 'To do') =>
    setDraft({ listId: list?.id ?? project.taskLists[0].id, status, priority: 'Medium', assignees: [], labels: [], progress: STAGE_PROGRESS[status] });

  const tasks = project.tasks.filter(
    (t) =>
      (!list || t.listId === list.id) &&
      (!assignee || t.assignees.includes(assignee)) &&
      matchesQuery(query, t.title, `#${t.number}`, t.labels.join(' '), t.assignees.join(' '))
  );

  const moveTo = (taskId, status) => api.patch('tasks', taskId, { status, progress: STAGE_PROGRESS[status] });

  return (
    <div className="tasks-view">
      <div className="view-bar">
        {level >= 3 && <Dropdown
          trigger={({ toggle }) => (
            <div className="split-btn">
              <button className="btn btn-outline-accent btn-sm" onClick={() => newTask()}><Plus size={16} /> Add</button>
              <button className="btn btn-outline-accent btn-sm caret" onClick={toggle} aria-label="More add options"><ChevronDown size={16} /></button>
            </div>
          )}
        >
          {(close) => (
            <>
              <button onClick={() => { close(); newTask(); }}><Plus size={14} /> Task</button>
              <button onClick={() => { close(); openAddList(); }}><ListChecks size={14} /> Task list</button>
            </>
          )}
        </Dropdown>}

        <div className="seg">
          <button className={view === 'Board' ? 'active' : ''} onClick={() => setView('Board')}><Kanban size={16} /> Board</button>
          <button className={view === 'Table' ? 'active' : ''} onClick={() => setView('Table')}><Table size={16} /> Table</button>
        </div>

        <h2 className="view-title">{list?.name ?? 'All tasks'}</h2>

        <div className="view-bar-right">
          <input className="search-input sm" type="search" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="select-sm" value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Filter by assignee">
            <option value="">Everyone</option>
            {people.map((n) => <option key={n}>{n}</option>)}
          </select>
          <AvatarStack names={project.members.map((m) => m.name)} max={3} />
        </div>
      </div>

      {view === 'Board' ? (
        <div className="board">
          {TASK_STATUSES.map((status) => {
            const col = tasks.filter((t) => t.status === status);
            const colPeople = new Set(col.flatMap((t) => t.assignees));
            return (
              <div
                key={status}
                className={`board-col ${over === status ? 'over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setOver(status); }}
                onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setOver(null)}
                onDrop={() => {
                  if (dragId) moveTo(dragId, status);
                  setDragId(null);
                  setOver(null);
                }}
              >
                <div className="col-head">
                  <span className="col-name">{status}</span>
                  <span className={`col-count stage-${slug(status)}`}>{col.length}</span>
                  <span className="grow" />
                  {level >= 3 && <button className="icon-btn" title={`Add task to ${status}`} onClick={() => newTask(status)}><Plus size={16} /></button>}
                  <span className="col-people" title="Assignees in this column"><Users size={14} /> {colPeople.size}</span>
                </div>
                {col.map((t) => (
                  <TaskCard
                    key={t.id}
                    project={project}
                    task={t}
                    canDrag={taskRights(project, user.id, me, t).stage}
                    onOpen={() => setDraft(t)}
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => { setDragId(null); setOver(null); }}
                  />
                ))}
                {col.length === 0 && <div className="col-empty">Drop tasks here</div>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="view-body">
          {tasks.length === 0 ? <Empty>No tasks.</Empty> : (
            <div className="table-wrap">
              <table className="table clickable">
                <thead>
                  <tr><th>ID</th><th>Task</th>{!list && <th>List</th>}<th>Stage</th><th>Assignees</th><th>Due</th><th>Progress</th><th>Priority</th></tr>
                </thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr key={t.id} onClick={() => setDraft(t)}>
                      <td className="meta">#{t.number}</td>
                      <td><strong>{t.title}</strong> <AttachmentBadge project={project} entityId={t.id} /><Labels labels={t.labels} /></td>
                      {!list && <td>{project.taskLists.find((l) => l.id === t.listId)?.name}</td>}
                      <td><span className={statusClass(t.status)}>{t.status}</span></td>
                      <td><AvatarStack names={t.assignees} /></td>
                      <td className={isOverdue(t) ? 'overdue' : ''}>{t.due ? shortDate(t.due) : '—'}</td>
                      <td><div className="mini-progress"><div style={{ width: `${taskProgress(t)}%` }} /></div> <span className="meta">{taskProgress(t)}%</span></td>
                      <td><PriorityFlag priority={t.priority} /> {t.priority}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {editing && <TaskModal key={editing.id ?? 'new'} project={project} api={api} task={editing} onClose={closeTask} />}
    </div>
  );
}

function TaskCard({ project, task: t, canDrag, onOpen, onDragStart, onDragEnd }) {
  return (
    <article className={`tcard ${canDrag ? '' : 'no-drag'}`} draggable={canDrag} onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onOpen}>
      <h4>{t.title}</h4>
      <Labels labels={t.labels} />
      <dl className="tcard-fields">
        <dt><Hash size={14} /> Task ID</dt><dd>#{t.number}</dd>
        <dt><Users size={14} /> Assignees</dt><dd><AvatarStack names={t.assignees} /></dd>
        {t.start && <><dt><Calendar size={14} /> Start date</dt><dd>{shortDate(t.start)}</dd></>}
        <dt><Calendar size={14} /> Due date</dt>
        <dd className={isOverdue(t) ? 'overdue' : ''}>{t.due ? shortDate(t.due) : '—'}</dd>
        <dt><TrendingUp size={14} /> Progress</dt><dd>{taskProgress(t)}%</dd>
      </dl>
      <footer className="tcard-foot">
        <span title="Comments"><MessageCircle size={14} /> {t.comments.length}</span>
        <AttachmentBadge project={project} entityId={t.id} />
        <span className="grow" />
        {t.hours > 0 && <span title="Hours logged">{t.hours}h</span>}
        <PriorityFlag priority={t.priority} />
      </footer>
    </article>
  );
}

/* ---------- Task editor ---------- */

export function TaskModal({ project, api, task, onClose }) {
  const { user, me } = useStore();
  const rights = taskRights(project, user.id, me, task);
  const { level } = rights;
  const lock = !rights.details; // details can't be changed
  const readOnly = !rights.stage; // nothing can be changed
  const [v, setV] = useState({ description: '', start: '', due: '', hours: 0, ...task });
  const [error, setError] = useState('');
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState([]);
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));
  const toggle = (k, item) => set(k, v[k].includes(item) ? v[k].filter((x) => x !== item) : [...v[k], item]);
  const people = [...new Set([...projectPeople(project), ...v.assignees])];
  // Read comments from the live project so new ones appear immediately.
  const comments = project.tasks.find((t) => t.id === task.id)?.comments ?? [];

  const save = (e) => {
    e.preventDefault();
    if (!v.title?.trim()) return setError('Task name is required');
    if (v.start && v.due && v.start > v.due) return setError('Start date must be before the due date');
    const { comments: _ignored, id, number, createdBy, ...fields } = v;
    const progress = { status: v.status, progress: STAGE_PROGRESS[v.status] ?? 0, hours: Number(v.hours) || 0 };
    const data = lock ? progress : { ...fields, ...progress, title: v.title.trim() };
    if (task.id) api.patch('tasks', task.id, data);
    else {
      const id = api.add('tasks', { ...data, comments: [] });
      if (pending.length) uploadPending(api, 'task', id, pending);
    }
    onClose();
  };

  const addComment = () => {
    if (!comment.trim()) return;
    api.addComment(task.id, comment.trim());
    setComment('');
  };

  return (
    <Modal open onClose={onClose} title={task.id ? `Task #${task.number}` : 'New task'} wide>
      {readOnly && <p className="meta mb">You can view this task but not change it.</p>}
      {lock && !readOnly && (
        <p className="notice mb">You’re assigned to this task: you can move its stage, log hours, comment and add photos.
          Only its creator, the owner or a project manager can change the details.</p>
      )}
      <form className="form" onSubmit={save} noValidate>
        <fieldset className="contents" disabled={readOnly}>
        <label className="field full">
          <span>Task *</span>
          <input autoFocus={!lock} disabled={lock} value={v.title ?? ''} onChange={(e) => set('title', e.target.value)} placeholder="What needs to be done?" />
        </label>
        <label className="field">
          <span>Task list</span>
          <select disabled={lock} value={v.listId} onChange={(e) => set('listId', e.target.value)}>
            {project.taskLists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Stage</span>
          <select value={v.status} onChange={(e) => set('status', e.target.value)}>
            {TASK_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>

        <div className="field full">
          <span>Assignees</span>
          {people.length === 0 ? (
            <span className="meta">Invite people or add contacts on the Team page to assign tasks.</span>
          ) : (
            <div className="pick-list">
              {people.map((n) => (
                <button type="button" key={n} disabled={lock} className={`pick ${v.assignees.includes(n) ? 'on' : ''}`} onClick={() => toggle('assignees', n)}>
                  <Avatar name={n} /> {n}
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="field">
          <span>Start date</span>
          <input type="date" disabled={lock} value={v.start} onChange={(e) => set('start', e.target.value)} />
        </label>
        <label className="field">
          <span>Due date</span>
          <input type="date" disabled={lock} value={v.due} onChange={(e) => set('due', e.target.value)} />
        </label>
        <div className="field">
          <span>Progress: {taskProgress(v)}%</span>
          <div className="progress"><div className="progress-bar" style={{ width: `${taskProgress(v)}%` }} /></div>
          <span className="meta">Set by stage — To do 0%, In progress 50%, In review 90%, Done 100%.</span>
        </div>
        <label className="field">
          <span>Priority</span>
          <select disabled={lock} value={v.priority} onChange={(e) => set('priority', e.target.value)}>
            {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>

        <div className="field full">
          <span>Labels</span>
          <div className="pick-list">
            {LABELS.map((l) => (
              <button type="button" key={l.name} disabled={lock} className={`pick label-pick ${v.labels.includes(l.name) ? 'on' : ''}`}
                style={{ '--label': l.color }} onClick={() => toggle('labels', l.name)}>
                {l.name}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>Hours logged</span>
          <input type="number" min="0" step="0.5" value={v.hours} onChange={(e) => set('hours', e.target.value)} />
        </label>
        <label className="field full">
          <span>Description</span>
          <textarea rows={3} disabled={lock} value={v.description} onChange={(e) => set('description', e.target.value)} />
        </label>

        <div className="field full">
          <Attachments project={project} api={api} entityType="task" entityId={task.id} pending={pending} onPending={setPending} readOnly={level < 2} />
        </div>
        </fieldset>

        {error && <p className="error full">{error}</p>}
        {!readOnly && <div className="btn-row full">
          <button type="submit" className="btn btn-primary">{task.id ? (lock ? 'Save progress' : 'Save task') : 'Create task'}</button>
          {task.id && rights.details && (
            <button type="button" className="btn btn-outline danger" onClick={() => { api.remove('tasks', task.id); onClose(); }}>Delete</button>
          )}
        </div>}
      </form>

      {task.id && (
        <section className="comments">
          <h4><MessageCircle size={16} /> Comments ({comments.length})</h4>
          {comments.map((c) => (
            <div key={c.id} className="comment">
              <Avatar name={c.author} />
              <div>
                <p className="meta"><strong>{c.author}</strong> · {formatDate(c.date)}</p>
                <p>{c.text}</p>
              </div>
            </div>
          ))}
          {level >= 2 && <div className="comment-box">
            <textarea rows={2} placeholder="Write a comment…" value={comment} onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && addComment()} />
            <button type="button" className="btn btn-outline btn-sm" onClick={addComment} disabled={!comment.trim()}>Comment</button>
          </div>}
        </section>
      )}
    </Modal>
  );
}
