import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Banknote, CalendarDays, ChartGantt, ChevronDown, ChevronRight, CircleHelp, ClipboardList, FileText, Flag, Forklift,
  LayoutDashboard, ListChecks, Menu, Package, Plus, Receipt, Settings, Star, Users, Wallet, X,
} from 'lucide-react';
import { Empty, FilterBar, Modal, Progress, SimpleForm, Dropdown } from '../components/ui.jsx';
import { matchesQuery, shortDate } from '../hooks.js';
import { PROJECT_STATUSES, PROJECT_TYPES, seedProjects } from '../data/projects.js';
import { access, browserSavedProjects, seesContract, canApproveFor, isOverdue, money, ROLES, roleOf, progressOf, statusClass, useProjectApi, useStore } from '../store.jsx';

const projectFields = [
  { name: 'name', label: 'Project name', required: true, full: true },
  { name: 'client', label: 'Client', required: true },
  { name: 'location', label: 'Location' },
  { name: 'type', label: 'Type', type: 'select', options: PROJECT_TYPES, allowOther: true, otherPlaceholder: 'Type the project type, e.g. Plumbing works' },
  { name: 'status', label: 'Status', type: 'select', options: PROJECT_STATUSES, required: true },
  { name: 'start', label: 'Start date', type: 'date' },
  { name: 'end', label: 'Target completion', type: 'date' },
  { name: 'budget', label: 'Contract value (₦)', type: 'number', hint: 'Only project owners can see this.' },
  { name: 'description', label: 'Description', type: 'textarea', full: true },
];

/* ---------- All projects ---------- */

export function ProjectsList() {
  const { projects, user, createProject, importData } = useStore();
  const [params, setParams] = useSearchParams();
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const navigate = useNavigate();
  const creating = params.get('new') === '1';

  const visible = projects.filter(
    (p) => (status === 'All' || p.status === status) && matchesQuery(query, p.name, p.client, p.location)
  );
  const taskHits = query.trim()
    ? projects
        .filter((p) => status === 'All' || p.status === status)
        .flatMap((p) => p.tasks
          .filter((t) => matchesQuery(query, t.title, `#${t.number}`, t.assignees.join(' '), t.labels.join(' ')))
          .map((t) => ({ p, t })))
    : [];
  const openTasks = projects.reduce((n, p) => n + p.tasks.filter((t) => t.status !== 'Done').length, 0);
  const openRfis = projects.reduce((n, p) => n + p.rfis.filter((r) => r.status === 'Open').length, 0);
  const owned = projects.filter((p) => seesContract(p, user.id));
  const totalBudget = owned.reduce((n, p) => n + Number(p.budget || 0), 0);

  const create = (values) => navigate(`/projects/${createProject(values)}`);
  const saved = browserSavedProjects();

  const runImport = async (list) => {
    setImporting(true);
    try {
      await importData(list);
    } catch (e) {
      alert(`Import failed: ${e.message}`);
    }
    setImporting(false);
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Projects</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setParams({ new: '1' })}><Plus size={16} /> New project</button>
      </div>

      <div className="stats mb">
        <div className="stat"><strong>{projects.filter((p) => p.status === 'Active').length}</strong><span>Active projects</span></div>
        <div className="stat"><strong>{openTasks}</strong><span>Open tasks</span></div>
        <div className="stat"><strong>{openRfis}</strong><span>Open requests for information</span></div>
        {owned.length > 0 && <div className="stat"><strong>{money(totalBudget)}</strong><span>Total contract value (your projects)</span></div>}
      </div>

      <FilterBar query={query} onQuery={setQuery} placeholder="Search projects and tasks…" options={PROJECT_STATUSES} active={status} onActive={setStatus} />

      {projects.length === 0 ? (
        <Empty>
          <h3>No projects yet</h3>
          <p>Create your first project, or start from example data. Projects you’re invited to will also appear here.</p>
          <div className="btn-row center">
            <button className="btn btn-primary btn-sm" onClick={() => setParams({ new: '1' })}><Plus size={16} /> New project</button>
            <button className="btn btn-outline btn-sm" disabled={importing} onClick={() => runImport(seedProjects)}>Add sample projects</button>
            {saved && (
              <button className="btn btn-outline btn-sm" disabled={importing} onClick={() => runImport(saved)}>
                Import {saved.length} project{saved.length > 1 ? 's' : ''} saved in this browser
              </button>
            )}
          </div>
          {importing && <p className="meta mt-sm">Importing…</p>}
        </Empty>
      ) : visible.length === 0 && taskHits.length === 0 ? (
        <Empty>No projects or tasks match your search.</Empty>
      ) : visible.length === 0 ? (
        null
      ) : (
        <div className="grid grid-3">
          {visible.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="card card-link">
              <div className="project-stripe" style={{ background: `hsl(${p.hue} 70% 50%)` }} />
              <div className="card-body">
                <span className={statusClass(p.status)}>{p.status}</span>
                <h3>{p.name}</h3>
                <p className="meta">{p.client}{p.location && ` · ${p.location}`}</p>
                <Progress value={progressOf(p)} />
                <div className="row-between meta">
                  <span>{Math.round(progressOf(p) * 100)}% complete</span>
                  {seesContract(p, user.id) && <span>{money(p.budget)}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {taskHits.length > 0 && (
        <section className="task-group mt-lg">
          <h3>Tasks <span className="col-count">{taskHits.length}</span></h3>
          <ul className="task-rows">
            {taskHits.map(({ p, t }) => (
              <li key={`${p.id}-${t.id}`}>
                <Link className="task-row-main" to={`/projects/${p.id}/tasks?task=${t.id}`}>
                  <strong>{t.title}</strong>
                  <span className="meta">#{t.number} · {p.name} · {p.taskLists.find((l) => l.id === t.listId)?.name}</span>
                </Link>
                <span className={statusClass(t.status)}>{t.status}</span>
                <span className={`meta due ${isOverdue(t) ? 'overdue' : ''}`}>{t.due ? shortDate(t.due) : '—'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal open={creating} onClose={() => setParams({})} title="New project" wide>
        <SimpleForm fields={projectFields} initial={{ status: 'Preliminaries' }} submitLabel="Create project" onSubmit={create} />
      </Modal>
    </div>
  );
}

/* ---------- Single project: sidebar + workspace ---------- */

const navGroups = [
  { title: 'Planning', items: [
    { to: 'gantt', label: 'Gantt', icon: ChartGantt, area: 'tasks', min: 1 },
    { to: 'calendar', label: 'Calendar', icon: CalendarDays, area: 'tasks', min: 1 },
    { to: 'milestones', label: 'Milestones', icon: Flag, area: 'tasks', min: 1 },
  ] },
  { title: 'Money', items: [
    { to: 'finance', label: 'Finance', icon: Wallet, area: 'finance', min: 1 },
    { to: 'budget', label: 'Budget', icon: Banknote, area: 'budget', min: 1 },
    { to: 'expenses', label: 'Expenses', icon: Receipt, area: 'expenses', min: 2 },
  ] },
  { title: 'Site', items: [
    { to: 'materials', label: 'Materials', icon: Package, area: 'site', min: 1 },
    { to: 'equipment', label: 'Equipment', icon: Forklift, area: 'site', min: 1 },
    { to: 'logs', label: 'Daily logs', icon: ClipboardList, area: 'logs', min: 1 },
    { to: 'rfis', label: 'Requests for Information', icon: CircleHelp, area: 'rfis', min: 1 },
  ] },
  { title: 'Project', items: [
    { to: 'documents', label: 'Documents', icon: FileText, area: 'documents', min: 1 },
    { to: 'team', label: 'Team', icon: Users, area: 'team', min: 1 },
  ] },
];

// Which access area (and minimum level) each project page needs.
const PAGE_ACCESS = Object.fromEntries(navGroups.flatMap((g) => g.items.map((i) => [i.to, [i.area, i.min]])));
PAGE_ACCESS.tasks = ['tasks', 1];

export function ProjectLayout() {
  const { id } = useParams();
  const { projects, user, deleteProject: removeProject } = useStore();
  const [tasksOpen, setTasksOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [addingList, setAddingList] = useState(false);
  const [editing, setEditing] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const api = useProjectApi(id);
  const project = projects.find((p) => p.id === id);
  const can = (area, min = 1) => project && access(project, user.id, area) >= min;
  const [pageArea, pageMin] = PAGE_ACCESS[pathname.split('/')[3]] ?? [];
  const pageAllowed = !pageArea || can(pageArea, pageMin);
  // Things waiting on this person, shown as counts in the sidebar.
  const waiting = project ? {
    expenses: project.expenses.filter((e) => e.status === 'Pending' && canApproveFor(project, user.id, e.createdBy)).length,
    budget: project.budgetRequests.filter((r) => r.status === 'Pending' && canApproveFor(project, user.id, r.requestedBy)).length,
  } : {};

  useEffect(() => setSidebarOpen(false), [pathname]);

  if (!project) {
    return (
      <div className="page">
        <Empty>Project not found. <Link className="link-btn" to="/projects">See all projects</Link></Empty>
      </div>
    );
  }

  const deleteList = (list) => {
    const count = project.tasks.filter((t) => t.listId === list.id).length;
    if (!confirm(`Delete task list "${list.name}"${count ? ` and its ${count} tasks` : ''}?`)) return;
    api.removeList(list.id);
    navigate(`/projects/${id}/tasks`);
  };

  const deleteProject = () => {
    if (!confirm(`Delete "${project.name}"? This cannot be undone.`)) return;
    removeProject(id);
    navigate('/projects');
  };

  return (
    <div className={`project-shell ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <aside className="sidebar">
        <Dropdown
          className="switcher"
          trigger={({ toggle }) => (
            <button className="switcher-btn" onClick={toggle}>
              <Star size={16} className="star" />
              <span className="switcher-name">{project.name}</span>
              <ChevronDown size={16} />
            </button>
          )}
        >
          {(close) => (
            <>
              {projects.map((p) => (
                <Link key={p.id} to={`/projects/${p.id}`} className={p.id === id ? 'active' : ''} onClick={close}>
                  <span className="dot" style={{ background: `hsl(${p.hue} 70% 50%)` }} /> {p.name}
                </Link>
              ))}
              <hr />
              <Link to="/projects" onClick={close}>All projects</Link>
              <Link to="/projects?new=1" onClick={close}><Plus size={14} /> New project</Link>
            </>
          )}
        </Dropdown>

        <div className="side-head">
          <button className="side-toggle" onClick={() => setTasksOpen((o) => !o)} aria-expanded={tasksOpen}>
            {tasksOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <ListChecks size={16} /> Tasks
          </button>
          {can('tasks', 3) && <button className="icon-btn" title="Add task list" onClick={() => setAddingList(true)}><Plus size={16} /></button>}
        </div>
        {tasksOpen && (
          <ul className="side-lists">
            <li>
              <NavLink to="tasks" end>
                <span>All tasks</span>
                <span className="side-count">{project.tasks.filter((t) => t.status === 'Done').length}/{project.tasks.length}</span>
              </NavLink>
            </li>
            {project.taskLists.map((l) => {
              const tasks = project.tasks.filter((t) => t.listId === l.id);
              return (
                <li key={l.id}>
                  <NavLink to={`tasks/${l.id}`}>
                    <span>{l.name}</span>
                    <span className="side-count">{tasks.filter((t) => t.status === 'Done').length}/{tasks.length}</span>
                  </NavLink>
                  {project.taskLists.length > 1 && can('tasks', 3) && (
                    <button className="side-del" title={`Delete ${l.name}`} onClick={() => deleteList(l)}><X size={12} /></button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {navGroups.map((g) => ({ ...g, items: g.items.filter((i) => can(i.area, i.min)) })).filter((g) => g.items.length).map((g) => (
          <nav key={g.title} className="side-nav" aria-label={g.title}>
            <span className="side-group">{g.title}</span>
            {g.items.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to}>
                <Icon size={16} /> {label}
                {waiting[to] > 0 && <span className="side-badge" title={`${waiting[to]} waiting for your approval`}>{waiting[to]}</span>}
              </NavLink>
            ))}
          </nav>
        ))}

        <nav className="side-nav side-foot">
          <NavLink to="overview"><LayoutDashboard size={16} /> Overview</NavLink>
          {can('settings', 3) && <button onClick={() => setEditing(true)}><Settings size={16} /> Project settings</button>}
        </nav>
      </aside>
      <div className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />

      <section className="workspace">
        <button className="mobile-side-btn" onClick={() => setSidebarOpen(true)}><Menu size={18} /> {project.name}</button>
        {pageAllowed ? (
          <Outlet context={{ project, api, openAddList: () => setAddingList(true) }} />
        ) : (
          <div className="page">
            <Empty>
              <h3>You don’t have access to this page</h3>
              <p>Your role on this project is <strong>{ROLES[roleOf(project, user.id)] ?? 'unknown'}</strong>. Ask a project owner if you need access.</p>
            </Empty>
          </div>
        )}
      </section>

      <Modal open={addingList} onClose={() => setAddingList(false)} title="New task list">
        <SimpleForm
          fields={[{ name: 'name', label: 'List name', required: true, full: true }]}
          submitLabel="Create list"
          onSubmit={({ name }) => {
            const listId = api.add('taskLists', { name });
            setAddingList(false);
            navigate(`/projects/${id}/tasks/${listId}`);
          }}
        />
      </Modal>

      <Modal open={editing} onClose={() => setEditing(false)} title="Project settings" wide>
        <SimpleForm
          fields={seesContract(project, user.id) ? projectFields : projectFields.filter((f) => f.name !== 'budget')}
          initial={project}
          submitLabel="Save changes"
          onSubmit={(v) => {
            api.updateProject(seesContract(project, user.id) ? { ...v, budget: Number(v.budget) || 0 } : v);
            setEditing(false);
          }}
        />
        {can('settings', 4) ? (
          <button className="btn btn-outline danger full mt-sm" onClick={deleteProject}>Delete project</button>
        ) : (
          <p className="meta mt-sm">Only project owners can delete this project.</p>
        )}
      </Modal>
    </div>
  );
}
