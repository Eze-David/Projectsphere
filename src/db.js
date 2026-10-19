// Maps between the app's objects (camelCase, '' for empty dates) and Supabase rows (snake_case, null dates).
import { supabase } from './supabase.js';

// App collection key → table name.
export const TABLES = {
  projects: 'projects',
  taskLists: 'task_lists',
  tasks: 'tasks',
  milestones: 'milestones',
  costs: 'costs',
  rfis: 'rfis',
  logs: 'daily_logs',
  team: 'team_contacts',
  expenses: 'expenses',
  invoices: 'invoices',
  materials: 'materials',
  equipment: 'equipment',
  documents: 'documents',
  attachments: 'attachments',
  budgetRequests: 'budget_requests',
  allocations: 'budget_allocations',
  allocationPayments: 'allocation_payments',
};

// App field → column, per collection. Only these fields are ever written.
const FIELDS = {
  projects: {
    name: 'name', client: 'client', location: 'location', type: 'type', status: 'status',
    start: 'start_date', end: 'end_date', hue: 'hue', description: 'description',
  },
  taskLists: { name: 'name', position: 'position' },
  tasks: {
    listId: 'list_id', number: 'number', title: 'title', description: 'description', status: 'status',
    assignees: 'assignees', start: 'start_date', due: 'due_date', progress: 'progress', priority: 'priority',
    labels: 'labels', hours: 'hours',
  },
  milestones: { name: 'name', date: 'date', done: 'done' },
  costs: { code: 'code', description: 'description', budgeted: 'budgeted', actual: 'actual' },
  rfis: {
    number: 'number', subject: 'subject', assignee: 'assignee', due: 'due_date', status: 'status',
    question: 'question', answer: 'answer',
  },
  logs: { date: 'date', weather: 'weather', crew: 'crew', workforce: 'workforce', notes: 'notes' },
  team: { name: 'name', role: 'role', company: 'company', email: 'email' },
  expenses: {
    date: 'date', description: 'description', category: 'category', vendor: 'vendor', costId: 'cost_id',
    amount: 'amount', paymentMethod: 'payment_method', status: 'status', rejectionReason: 'rejection_reason',
  },
  invoices: {
    number: 'number', date: 'date', due: 'due_date', description: 'description', amount: 'amount',
    status: 'status', paidDate: 'paid_date', payments: 'payments',
  },
  materials: {
    name: 'name', unit: 'unit', quantity: 'quantity', delivered: 'delivered', used: 'used', unitCost: 'unit_cost',
    supplier: 'supplier', neededBy: 'needed_by', status: 'status',
  },
  equipment: {
    name: 'name', category: 'category', ownership: 'ownership', supplier: 'supplier', dailyRate: 'daily_rate',
    start: 'start_date', end: 'end_date', status: 'status', operator: 'operator', notes: 'notes',
  },
  documents: {
    name: 'name', folder: 'folder', path: 'path', size: 'size', mime: 'mime', uploader: 'uploader',
  },
  attachments: {
    entityType: 'entity_type', entityId: 'entity_id', name: 'name', path: 'path', size: 'size', mime: 'mime', uploader: 'uploader',
  },
  budgetRequests: { costId: 'cost_id', code: 'code', description: 'description', amount: 'amount', reason: 'reason' },
  allocations: { costId: 'cost_id', recipientUser: 'recipient_user', recipientRole: 'recipient_role', amount: 'amount', purpose: 'purpose' },
  allocationPayments: { allocationId: 'allocation_id', payee: 'payee', date: 'date', amount: 'amount', method: 'method', note: 'note' },
};

// Columns the app reads but never writes: the database sets them (who submitted/approved, and when).
const READ_ONLY = {
  expenses: { createdBy: 'created_by', approvedBy: 'approved_by', approvedByName: 'approved_by_name', approvedAt: 'approved_at' },
  logs: { createdBy: 'created_by' },
  allocations: { createdBy: 'created_by', createdAt: 'created_at' },
  allocationPayments: {
    paidBy: 'paid_by', paidByName: 'paid_by_name', status: 'status', payeeNote: 'payee_note',
    respondedAt: 'responded_at', createdAt: 'created_at',
  },
  tasks: { createdBy: 'created_by' },
  budgetRequests: {
    currentAmount: 'current_amount', status: 'status', requestedBy: 'requested_by', requestedByName: 'requested_by_name',
    decidedByName: 'decided_by_name', decidedAt: 'decided_at', decisionNote: 'decision_note', createdAt: 'created_at',
  },
};

const DATE_COLUMNS = new Set(['start_date', 'end_date', 'due_date', 'date', 'needed_by', 'paid_date']);
const NULLABLE_COLUMNS = new Set(['cost_id', 'recipient_user', 'recipient_role']);
const NUMBER_COLUMNS = new Set([
  'current_amount', 'budget', 'hue', 'position', 'number', 'progress', 'hours', 'budgeted', 'actual', 'crew',
  'amount', 'quantity', 'delivered', 'used', 'unit_cost', 'daily_rate', 'size',
]);

export function toRow(kind, obj) {
  const row = {};
  for (const [field, col] of Object.entries(FIELDS[kind])) {
    if (!(field in obj)) continue;
    let v = obj[field];
    if (DATE_COLUMNS.has(col) || NULLABLE_COLUMNS.has(col)) v = v || null;
    else if (NUMBER_COLUMNS.has(col)) v = Number(v) || 0;
    row[col] = v;
  }
  return row;
}

export function fromRow(kind, row) {
  const obj = { id: row.id };
  for (const [field, col] of Object.entries({ ...FIELDS[kind], ...READ_ONLY[kind] })) {
    const v = row[col];
    obj[field] = NUMBER_COLUMNS.has(col) ? Number(v) || 0 : v ?? '';
  }
  return obj;
}

async function selectAll(table, order = 'created_at') {
  const { data, error } = await supabase.from(table).select('*').order(order);
  if (error) throw error;
  return data;
}

// Tables added by a later migration: if it hasn't been run yet, load the rest of the app anyway.
export const missingTables = new Set();
async function selectOptional(table, order) {
  try {
    const rows = await selectAll(table, order);
    missingTables.delete(table);
    return rows;
  } catch (e) {
    if (e.code === 'PGRST205' || e.code === '42P01') {
      missingTables.add(table);
      return [];
    }
    throw e;
  }
}

// Everything the signed-in user can see (RLS limits rows to their projects), assembled into nested projects.
export async function fetchProjects() {
  const [projects, lists, tasks, comments, milestones, costs, rfis, logs, team, members, invites,
    expenses, invoices, materials, equipment, documents, attachments, budgetRequests, contractValues,
    allocations, allocationPayments] = await Promise.all([
    selectAll('projects'),
    selectAll('task_lists', 'position'),
    selectAll('tasks', 'number'),
    selectAll('task_comments'),
    selectAll('milestones', 'date'),
    selectAll('costs'),
    selectAll('rfis', 'number'),
    selectAll('daily_logs', 'date'),
    selectAll('team_contacts'),
    supabase.from('project_members').select('project_id, user_id, role, profiles(full_name, email)').then(({ data, error }) => {
      if (error) throw error;
      return data;
    }),
    selectAll('project_invites'),
    selectOptional('expenses', 'date'),
    selectOptional('invoices', 'number'),
    selectOptional('materials'),
    selectOptional('equipment'),
    selectOptional('documents'),
    selectOptional('attachments'),
    selectOptional('budget_requests'),
    selectOptional('contract_values', 'project_id'),
    selectOptional('budget_allocations'),
    selectOptional('allocation_payments', 'date'),
  ]);

  const byProject = (rows) => {
    const map = new Map();
    for (const r of rows) map.set(r.project_id, [...(map.get(r.project_id) ?? []), r]);
    return (pid) => map.get(pid) ?? [];
  };
  const [listsOf, tasksOf, milestonesOf, costsOf, rfisOf, logsOf, teamOf, membersOf, invitesOf,
    expensesOf, invoicesOf, materialsOf, equipmentOf, documentsOf, attachmentsOf, budgetRequestsOf,
    allocationsOf, allocationPaymentsOf] =
    [lists, tasks, milestones, costs, rfis, logs, team, members, invites,
      expenses, invoices, materials, equipment, documents, attachments, budgetRequests,
      allocations, allocationPayments].map(byProject);

  // Contract value: from contract_values (only returned to roles with budget access). Before that
  // migration it was a column on projects.
  const contract = new Map(contractValues.map((c) => [c.project_id, Number(c.amount) || 0]));
  const legacyBudget = missingTables.has('contract_values');

  const commentsByTask = new Map();
  for (const c of comments) {
    const entry = { id: c.id, author: c.author, authorId: c.author_id, date: c.created_at.slice(0, 10), text: c.body };
    commentsByTask.set(c.task_id, [...(commentsByTask.get(c.task_id) ?? []), entry]);
  }

  return projects.map((p) => ({
    ...fromRow('projects', p),
    status: p.status === 'Pre-construction' ? 'Preliminaries' : p.status,
    budget: legacyBudget ? Number(p.budget) || 0 : contract.get(p.id) ?? 0,
    createdAt: p.created_at,
    taskLists: listsOf(p.id).map((r) => fromRow('taskLists', r)),
    tasks: tasksOf(p.id).map((r) => ({ ...fromRow('tasks', r), comments: commentsByTask.get(r.id) ?? [] })),
    milestones: milestonesOf(p.id).map((r) => fromRow('milestones', r)),
    costs: costsOf(p.id).map((r) => fromRow('costs', r)),
    rfis: rfisOf(p.id).map((r) => fromRow('rfis', r)),
    logs: logsOf(p.id).map((r) => fromRow('logs', r)),
    team: teamOf(p.id).map((r) => fromRow('team', r)),
    members: membersOf(p.id).map((m) => ({
      userId: m.user_id, role: m.role, name: m.profiles?.full_name || m.profiles?.email || 'Unknown', email: m.profiles?.email ?? '',
    })),
    invites: invitesOf(p.id).map((i) => ({ email: i.email, role: i.role ?? 'site_engineer' })),
    expenses: expensesOf(p.id).map((r) => fromRow('expenses', r)),
    invoices: invoicesOf(p.id).map((r) => {
      const inv = fromRow('invoices', r);
      // Before the payments migration, a Paid invoice had no payment records: treat it as paid in full.
      const payments = Array.isArray(inv.payments) ? inv.payments : [];
      return { ...inv, payments: payments.length || inv.status !== 'Paid' ? payments : [{ date: inv.paidDate || inv.date, amount: inv.amount, method: '' }] };
    }),
    materials: materialsOf(p.id).map((r) => fromRow('materials', r)),
    equipment: equipmentOf(p.id).map((r) => fromRow('equipment', r)),
    documents: documentsOf(p.id).map((r) => ({ ...fromRow('documents', r), createdAt: r.created_at })),
    attachments: attachmentsOf(p.id).map((r) => ({ ...fromRow('attachments', r), createdAt: r.created_at })),
    budgetRequests: budgetRequestsOf(p.id).map((r) => fromRow('budgetRequests', r)),
    allocations: allocationsOf(p.id).map((r) => fromRow('allocations', r)),
    allocationPayments: allocationPaymentsOf(p.id).map((r) => fromRow('allocationPayments', r)),
  })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveContractValue(projectId, amount) {
  return missingTables.has('contract_values')
    ? supabase.from('projects').update({ budget: amount }).eq('id', projectId)
    : supabase.from('contract_values').upsert({ project_id: projectId, amount });
}

// Copy whole projects (e.g. sample data or data saved in this browser) into Supabase with fresh ids.
export async function importProjects(projects, newId) {
  const check = ({ error }) => {
    if (error) throw error;
  };
  for (const p of projects) {
    const pid = newId();
    check(await supabase.from('projects').insert({ id: pid, ...toRow('projects', p) }));
    if (p.budget) check(await saveContractValue(pid, Number(p.budget) || 0));

    const listIds = new Map(p.taskLists.map((l) => [l.id, newId()]));
    const taskIds = new Map(p.tasks.map((t) => [t.id, newId()]));
    const rows = (kind, items, extra = () => ({})) =>
      items.map((x) => ({ id: newId(), project_id: pid, ...toRow(kind, x), ...extra(x) }));

    check(await supabase.from('task_lists').insert(
      p.taskLists.map((l, i) => ({ id: listIds.get(l.id), project_id: pid, ...toRow('taskLists', l), position: i }))
    ));
    if (p.tasks.length) {
      check(await supabase.from('tasks').insert(
        p.tasks.map((t) => ({ ...toRow('tasks', t), id: taskIds.get(t.id), project_id: pid, list_id: listIds.get(t.listId) }))
      ));
      const comments = p.tasks.flatMap((t) => (t.comments ?? []).map((c) => ({
        id: newId(), project_id: pid, task_id: taskIds.get(t.id), author: c.author, body: c.text,
        created_at: c.date ? `${c.date}T12:00:00Z` : new Date().toISOString(),
      })));
      if (comments.length) check(await supabase.from('task_comments').insert(comments));
    }
    const costIds = new Map(p.costs.map((c) => [c.id, newId()]));
    if (p.costs.length) {
      check(await supabase.from('costs').insert(p.costs.map((c) => ({ ...toRow('costs', c), id: costIds.get(c.id), project_id: pid }))));
    }
    for (const kind of ['milestones', 'rfis', 'logs', 'team', 'invoices', 'materials', 'equipment']) {
      if (p[kind]?.length) check(await supabase.from(TABLES[kind]).insert(rows(kind, p[kind])));
    }
    if (p.expenses?.length) {
      check(await supabase.from('expenses').insert(rows('expenses', p.expenses, (x) => ({ cost_id: costIds.get(x.costId) ?? null }))));
    }
  }
}
