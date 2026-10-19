import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase.js';
import { fetchProjects, importProjects, missingTables, saveContractValue, TABLES, toRow } from './db.js';

export const TODAY = new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD

export const uuid = () =>
  crypto.randomUUID?.() ??
  '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
  );
export const money = (n) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n || 0);
export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const initials = (name) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
export const statusClass = (s) => `status status-${slug(s)}`;
// Progress follows the task's stage on the board.
export const STAGE_PROGRESS = { 'To do': 0, 'In progress': 50, 'In review': 90, Done: 100 };
export const taskProgress = (t) => STAGE_PROGRESS[t.status] ?? 0;
export const progressOf = (p) =>
  p.tasks.length ? p.tasks.reduce((s, t) => s + taskProgress(t), 0) / p.tasks.length / 100 : 0;
// Money spent = expenses (except rejected ones) + any other actual costs entered directly on budget lines.
export const countedExpenses = (p) => p.expenses.filter((e) => e.status !== 'Rejected');
export const expensesOf = (p, costId) => countedExpenses(p).filter((e) => costId === undefined || e.costId === costId);
export const sumOf = (items, key) => items.reduce((s, x) => s + Number(x[key] || 0), 0);
export const spentOf = (p) => sumOf(p.costs, 'actual') + sumOf(countedExpenses(p), 'amount') + sumOf(p.allocationPayments, 'amount');

// Budget allocations: money set aside from a budget line for a person or a role, paid out in parts.
export const allocationPaid = (p, allocationId) => sumOf(p.allocationPayments.filter((x) => x.allocationId === allocationId), 'amount');
export const paidOutOf = (p, costId) =>
  sumOf(p.allocationPayments.filter((x) => p.allocations.find((a) => a.id === x.allocationId)?.costId === costId), 'amount');
export const allocatedOf = (p, costId) => sumOf(p.allocations.filter((a) => a.costId === costId), 'amount');

// ---------- Job roles ----------
// The database enforces these (role_level() in supabase/migrations/20261021000000_task_edit_rights.sql);
// the app uses the same table to decide what to show. Keep the two in sync.
export const ROLES = {
  owner: 'Owner',
  project_manager: 'Project Manager',
  quantity_surveyor: 'Quantity Surveyor',
  architect: 'Architect',
  structural_engineer: 'Structural Engineer',
  mechanical_engineer: 'Mechanical Engineer',
  electrical_engineer: 'Electrical Engineer',
  site_engineer: 'Site Engineer',
  subcontractor: 'Subcontractor',
  mason: 'Mason',
  client: 'Client',
};
// Levels: 0 hidden · 1 view · 2 limited (see `limited` below) · 3 edit · 4 approve/manage
// One number per role, in the order of ROLES above.
const row = (...levels) => Object.fromEntries(Object.keys(ROLES).map((r, i) => [r, levels[i]]));
export const ACCESS = {
  //              own pm qs arch str mech elec se sub mason client
  tasks: row(4, 4, 1, 3, 3, 3, 3, 3, 2, 2, 1),
  logs: row(4, 3, 1, 1, 1, 1, 1, 3, 2, 2, 1),
  site: row(4, 3, 3, 1, 1, 1, 1, 3, 0, 1, 0),
  rfis: row(4, 3, 1, 3, 3, 3, 3, 3, 3, 1, 1),
  documents: row(4, 3, 3, 3, 3, 3, 3, 3, 1, 1, 1),
  expenses: row(4, 4, 4, 0, 0, 0, 0, 2, 0, 0, 0),
  budget: row(4, 3, 3, 0, 0, 0, 0, 2, 0, 0, 0),
  finance: row(4, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0),
  team: row(4, 3, 1, 1, 1, 1, 1, 1, 0, 0, 0),
  settings: row(4, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0),
};
// How each area is described in the role table on the Team page.
export const AREAS = [
  { key: 'tasks', label: 'Tasks, Gantt, Calendar, Milestones', limited: 'Assigned tasks', edit: 'Create, edit own', top: 'Edit all' },
  { key: 'logs', label: 'Daily logs', limited: 'Add (own)' },
  { key: 'site', label: 'Materials & Equipment' },
  { key: 'rfis', label: 'Requests for Information' },
  { key: 'documents', label: 'Documents' },
  { key: 'expenses', label: 'Expenses', limited: 'Submit own', top: 'Approve' },
  { key: 'budget', label: 'Budget', limited: 'Request changes' },
  { key: 'finance', label: 'Finance (invoices, cash)' },
  { key: 'team', label: 'Team', edit: 'Invite', top: 'Manage, invite' },
  { key: 'settings', label: 'Project settings / delete', edit: 'Settings only', top: 'Both' },
];
export const levelLabel = (area, level) => {
  const a = AREAS.find((x) => x.key === area);
  return ['—', 'View', a.limited ?? 'Add', a.edit ?? 'Edit', a.top ?? a.edit ?? 'Edit'][level];
};
const LEGACY_ROLES = { approver: 'project_manager', member: 'site_engineer' }; // before the job-roles migration
export const roleOf = (p, userId) => {
  const r = p.members.find((m) => m.userId === userId)?.role;
  return LEGACY_ROLES[r] ?? r;
};
export const access = (p, userId, area) => ACCESS[area]?.[roleOf(p, userId)] ?? 0;
export const canApprove = (p, userId) => access(p, userId, 'expenses') >= 4;
// Approving something `submitter` sent in: never your own, unless nobody else on the project can approve.
export const canApproveFor = (p, userId, submitter) =>
  canApprove(p, userId) &&
  (submitter !== userId || !p.members.some((m) => m.userId !== userId && (ACCESS.expenses[LEGACY_ROLES[m.role] ?? m.role] ?? 0) >= 4));
// Recording a payment to `payee`: budget editors, never to themselves unless nobody else can make payments.
export const canPay = (p, userId, payee) =>
  access(p, userId, 'budget') >= 3 &&
  (payee !== userId || !p.members.some((m) => m.userId !== userId && (ACCESS.budget[LEGACY_ROLES[m.role] ?? m.role] ?? 0) >= 3));
// What to tell the inviter after one or more invites for the same person.
export function inviteMessage(email, roleLabel, outcomes) {
  const site = window.location.origin.replace(/^https?:\/\//, '');
  if (outcomes.some((o) => o.emailSent)) {
    return `We’ve emailed an invitation to ${email}. Once they accept it and choose a password, they’ll join as ${roleLabel}.`;
  }
  if (outcomes.every((o) => o.result === 'added')) {
    return `${email} already has an account, so they have access now as ${roleLabel} — the project appears in their list.`;
  }
  const failed = outcomes.find((o) => o.emailError);
  return failed
    ? `${email} is invited as ${roleLabel}, but the email couldn’t be sent (${failed.emailError}). Ask them to sign up at ${site} with this email.`
    : `${email} is invited as ${roleLabel}. Invitation emails aren’t switched on yet, so ask them to sign up at ${site} with this email.`;
}

export const memberName = (p, userId) => p.members.find((m) => m.userId === userId)?.name ?? '';
export const isOverdue = (t) => t.status !== 'Done' && t.due && t.due < TODAY;

// Fill in fields added after the first version, so sample data and older browser-saved data can be imported.
export function normalizeProject(p) {
  const taskLists = p.taskLists?.length ? p.taskLists : [{ id: 'general', name: 'General' }];
  return {
    tasks: [], milestones: [], costs: [], rfis: [], logs: [], team: [], members: [], invites: [],
    expenses: [], invoices: [], materials: [], equipment: [], documents: [], attachments: [], budgetRequests: [],
    allocations: [], allocationPayments: [],
    ...p,
    taskLists,
    tasks: (p.tasks || []).map((t, i) => ({
      description: '', start: '', due: '', priority: 'Medium', labels: [], hours: 0, comments: [],
      ...t,
      number: t.number ?? i + 1,
      listId: taskLists.some((l) => l.id === t.listId) ? t.listId : taskLists[0].id,
      assignees: t.assignees ?? (t.assignee ? [t.assignee] : []),
      progress: t.progress ?? (t.status === 'Done' ? 100 : 0),
    })),
  };
}

// Projects saved in this browser by the offline version of the app, if any.
export function browserSavedProjects() {
  for (const key of ['bh-projects-v2', 'bh-projects']) {
    try {
      const data = JSON.parse(localStorage.getItem(key));
      if (Array.isArray(data) && data.length) return data;
    } catch {
      // ignore unreadable data
    }
  }
  return null;
}

const StoreContext = createContext(null);

export function StoreProvider({ session, children }) {
  const user = session.user;
  const [projects, setProjects] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [needsMigration, setNeedsMigration] = useState(false);
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const reloadTimer = useRef();
  const me = profile?.full_name || user.email;

  const reload = useCallback(async () => {
    try {
      setProjects(await fetchProjects());
      setNeedsMigration(missingTables.size > 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    supabase.from('profiles').select('*').eq('id', user.id).single().then(({ data }) => setProfile(data));
    // Any change by anyone (RLS limits events to our projects) → refetch shortly after.
    const channel = supabase
      .channel('projectsphere-changes')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        clearTimeout(reloadTimer.current);
        reloadTimer.current = setTimeout(reload, 400);
      })
      .subscribe();
    return () => {
      clearTimeout(reloadTimer.current);
      supabase.removeChannel(channel);
    };
  }, [user.id, reload]);

  // Changes are applied locally right away; if the database rejects one, show why and resync.
  const write = useCallback(async (request) => {
    const { error } = await request;
    if (error) {
      setError(error.message);
      reload();
    }
  }, [reload]);

  const apiFor = useCallback((pid) => {
    const local = (fn) => setProjects((ps) => ps.map((p) => (p.id === pid ? fn(p) : p)));
    const api = {
      // key: 'tasks' | 'taskLists' | 'milestones' | 'costs' | 'rfis' | 'logs' | 'team'
      add(key, item) {
        const id = uuid();
        const p = projectsRef.current.find((x) => x.id === pid);
        const extra =
          key === 'taskLists' ? { position: p.taskLists.length }
          // The database records who created these (and starts expenses/requests as Pending); mirror that locally.
          : key === 'logs' ? { createdBy: user.id }
          : key === 'tasks' ? { number: Math.max(0, ...p.tasks.map((t) => t.number)) + 1, comments: [], createdBy: user.id }
          : key === 'expenses' ? { status: 'Pending', createdBy: user.id, approvedByName: '', approvedAt: '', rejectionReason: '' }
          : key === 'allocations' ? { createdBy: user.id, createdAt: new Date().toISOString() }
          : key === 'allocationPayments' ? {
            paidBy: user.id, paidByName: me, status: 'Awaiting confirmation', payeeNote: '', respondedAt: '', createdAt: new Date().toISOString(),
          }
          : key === 'budgetRequests' ? {
            status: 'Pending', requestedBy: user.id, requestedByName: me, createdAt: new Date().toISOString(),
            currentAmount: p.costs.find((c) => c.id === item.costId)?.budgeted ?? 0,
          }
          : {};
        const full = { ...item, ...extra, id };
        local((x) => ({ ...x, [key]: [...x[key], full] }));
        write(supabase.from(TABLES[key]).insert({ id, project_id: pid, ...toRow(key, full) }));
        return id;
      },
      patch(key, itemId, patch) {
        local((x) => ({ ...x, [key]: x[key].map((it) => (it.id === itemId ? { ...it, ...patch } : it)) }));
        write(supabase.from(TABLES[key]).update(toRow(key, patch)).eq('id', itemId));
      },
      remove(key, itemId) {
        const files = projectsRef.current.find((x) => x.id === pid)?.attachments.filter((a) => a.entityId === itemId) ?? [];
        local((x) => ({ ...x, [key]: x[key].filter((it) => it.id !== itemId), attachments: x.attachments.filter((a) => a.entityId !== itemId) }));
        write(supabase.from(TABLES[key]).delete().eq('id', itemId));
        if (files.length) {
          write(supabase.from('attachments').delete().eq('entity_id', itemId));
          supabase.storage.from('documents').remove(files.map((a) => a.path));
        }
      },
      updateProject(fields) {
        local((x) => ({ ...x, ...fields }));
        const row = toRow('projects', fields);
        if (Object.keys(row).length) write(supabase.from('projects').update(row).eq('id', pid));
        // The contract value lives in its own table so only roles with budget access can read it.
        if ('budget' in fields) write(saveContractValue(pid, Number(fields.budget) || 0));
      },
      removeList(listId) {
        local((x) => ({ ...x, taskLists: x.taskLists.filter((l) => l.id !== listId), tasks: x.tasks.filter((t) => t.listId !== listId) }));
        write(supabase.from('task_lists').delete().eq('id', listId));
      },
      addComment(taskId, text) {
        const comment = { id: uuid(), author: me, authorId: user.id, date: TODAY, text };
        local((x) => ({ ...x, tasks: x.tasks.map((t) => (t.id === taskId ? { ...t, comments: [...t.comments, comment] } : t)) }));
        write(supabase.from('task_comments').insert({ id: comment.id, project_id: pid, task_id: taskId, author: me, body: text }));
      },
      // Returns 'added' (they already have an account) or 'invited' (they get access when they sign up).
      // Adds the person and, if they have no account yet, emails them an invitation (Edge Function "invite").
      // Returns { result: 'added' | 'invited', emailSent, emailError?, notDeployed? }.
      async invite(email, role = 'site_engineer') {
        let outcome;
        const { data, error } = await supabase.functions.invoke('invite', {
          body: { projectId: pid, email, role, origin: window.location.origin },
        });
        if (!error) outcome = data;
        else {
          const status = error.context?.status;
          if (status && status !== 404) {
            const body = await error.context.json().catch(() => ({}));
            throw new Error(body.error || error.message);
          }
          // The email function isn't installed (or can't be reached): invite without an email.
          const { data: result, error: rpcError } = await supabase.rpc('invite_member', { pid, invite_email: email, invite_role: role });
          if (rpcError) throw rpcError;
          outcome = { result, emailSent: false, notDeployed: true };
        }
        await reload();
        return outcome;
      },
      removeMember(userId) {
        local((x) => ({ ...x, members: x.members.filter((m) => m.userId !== userId) }));
        write(supabase.from('project_members').delete().eq('project_id', pid).eq('user_id', userId));
      },
      // Files live in the private 'documents' bucket under <project id>/; a table row ('documents' for the
      // Documents page, 'attachments' for files attached to a record) holds the details.
      async uploadFile(key, file, extra, folder = '') {
        const id = uuid();
        const path = `${pid}/${folder}${id}-${file.name.replace(/[^\w.-]+/g, '_')}`;
        const { error: uploadError } = await supabase.storage.from('documents').upload(path, file, { contentType: file.type || undefined });
        if (uploadError) throw uploadError;
        const row = { ...extra, id, name: file.name, path, size: file.size, mime: file.type, uploader: me, createdAt: new Date().toISOString() };
        local((x) => ({ ...x, [key]: [...x[key], row] }));
        const { error } = await supabase.from(TABLES[key]).insert({ id, project_id: pid, ...toRow(key, row) });
        if (error) {
          local((x) => ({ ...x, [key]: x[key].filter((d) => d.id !== id) }));
          await supabase.storage.from('documents').remove([path]);
          throw error;
        }
      },
      uploadDocument(file, folder) {
        return api.uploadFile('documents', file, { folder });
      },
      uploadAttachment(file, entityType, entityId) {
        return api.uploadFile('attachments', file, { entityType, entityId }, 'attachments/');
      },
      removeAttachment(att) {
        local((x) => ({ ...x, attachments: x.attachments.filter((a) => a.id !== att.id) }));
        write(supabase.from('attachments').delete().eq('id', att.id));
        supabase.storage.from('documents').remove([att.path]);
      },
      async fileUrl(file, download = false) {
        const { data, error } = await supabase.storage.from('documents')
          .createSignedUrl(file.path, 3600, download ? { download: file.name } : undefined);
        if (error) throw error;
        return data.signedUrl;
      },
      documentUrl(doc, download = false) {
        return api.fileUrl(doc, download);
      },
      async signedUrls(paths) {
        const { data, error } = await supabase.storage.from('documents').createSignedUrls(paths, 3600);
        if (error) throw error;
        return data;
      },
      removeDocument(doc) {
        local((x) => ({ ...x, documents: x.documents.filter((d) => d.id !== doc.id) }));
        write(supabase.from('documents').delete().eq('id', doc.id));
        supabase.storage.from('documents').remove([doc.path]);
      },
      async setRole(userId, role) {
        local((x) => ({ ...x, members: x.members.map((m) => (m.userId === userId ? { ...m, role } : m)) }));
        const { error } = await supabase.rpc('set_member_role', { pid, member: userId, new_role: role });
        if (error) {
          setError(error.message);
          reload();
        }
      },
      // status: 'Approved' | 'Rejected' (needs reason) | 'Paid' | 'Pending' (resubmit)
      decideExpense(expenseId, status, reason = '') {
        const decided = ['Approved', 'Rejected'].includes(status)
          ? { approvedByName: me, approvedAt: new Date().toISOString() }
          : status === 'Pending' ? { approvedByName: '', approvedAt: '' } : {};
        local((x) => ({
          ...x,
          expenses: x.expenses.map((e) => (e.id === expenseId ? { ...e, status, rejectionReason: reason, ...decided } : e)),
        }));
        write(supabase.from('expenses').update({ status, rejection_reason: reason }).eq('id', expenseId));
      },
      async decideBudgetRequest(requestId, approve, note = '') {
        const { error } = await supabase.rpc('decide_budget_request', { rid: requestId, approve, note });
        if (error) throw error;
        await reload();
      },
      // The person paid confirms receipt, or reports a problem with a note.
      async respondToPayment(paymentId, received, response = '') {
        const { error } = await supabase.rpc('respond_to_payment', { payment: paymentId, received, response });
        if (error) throw error;
        await reload();
      },
      cancelInvite(email) {
        local((x) => ({ ...x, invites: x.invites.filter((i) => i.email !== email) }));
        write(supabase.from('project_invites').delete().eq('project_id', pid).eq('email', email));
      },
    };
    return api;
  }, [write, reload, me, user.id]);

  const createProject = useCallback((values) => {
    const id = uuid();
    const list = { id: uuid(), name: 'General', position: 0 };
    const project = normalizeProject({
      ...values,
      id,
      budget: Number(values.budget) || 0,
      hue: Math.floor(Math.random() * 360),
      createdAt: new Date().toISOString(),
      taskLists: [list],
      members: [{ userId: user.id, role: 'owner', name: me, email: user.email }],
    });
    setProjects((ps) => [project, ...ps]);
    (async () => {
      const { error } = await supabase.from('projects').insert({ id, ...toRow('projects', project) });
      if (error) {
        setError(error.message);
        return reload();
      }
      write(supabase.from('task_lists').insert({ id: list.id, project_id: id, ...toRow('taskLists', list) }));
      if (project.budget) write(saveContractValue(id, project.budget));
    })();
    return id;
  }, [user.id, user.email, me, write, reload]);

  const value = useMemo(() => ({
    projects, loading, error, user, me, profile, needsMigration,
    clearError: () => setError(''),
    apiFor,
    createProject,
    deleteProject(id) {
      setProjects((ps) => ps.filter((p) => p.id !== id));
      write(supabase.from('projects').delete().eq('id', id));
    },
    async importData(list) {
      await importProjects(list.map(normalizeProject), uuid);
      await reload();
    },
    async setMyName(fullName) {
      const { data, error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', user.id).select().single();
      if (error) throw error;
      setProfile(data);
      reload();
    },
    signOut: () => supabase.auth.signOut(),
  }), [projects, loading, error, user, me, profile, needsMigration, apiFor, createProject, write, reload]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => useContext(StoreContext);

export function useProjectApi(projectId) {
  const { apiFor } = useStore();
  return useMemo(() => apiFor(projectId), [apiFor, projectId]);
}

// Names that can be assigned tasks in a project: people with access, then the project directory.
export const projectPeople = (p) => [...new Set([...p.members.map((m) => m.name), ...p.team.map((m) => m.name)])];

// Everyone with access, everyone in a project directory, and anyone assigned a task — deduplicated by name.
export function allPeople(projects) {
  const map = new Map();
  const add = (person, p) => {
    const entry = map.get(person.name) ?? { role: '', company: '', email: '', ...person, projects: [] };
    if (!entry.projects.includes(p)) entry.projects.push(p);
    for (const k of ['role', 'company', 'email']) entry[k] ||= person[k] ?? '';
    map.set(person.name, entry);
  };
  for (const p of projects) {
    for (const m of p.members) add({ name: m.name, email: m.email, hasAccount: true }, p);
    for (const m of p.team) add(m, p);
    for (const t of p.tasks) for (const name of t.assignees) add({ name }, p);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
