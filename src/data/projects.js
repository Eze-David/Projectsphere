// Options and seed data for the project management app.
export const PROJECT_STATUSES = ['Preliminaries', 'Active', 'On hold', 'Completed'];
export const PROJECT_TYPES = [
  'Construction', 'Renovation', 'Electrification',
  'Commercial', 'Residential', 'Healthcare', 'Education', 'Industrial', 'Infrastructure',
];
export const TASK_STATUSES = ['To do', 'In progress', 'In review', 'Done'];
export const PRIORITIES = ['Low', 'Medium', 'High'];
export const RFI_STATUSES = ['Open', 'Answered', 'Closed'];
// Trades for the "workers on site" breakdown on daily logs (any other trade can be typed in).
export const TRADES = [
  'Mason', 'Bricklayer', 'Carpenter', 'Iron bender', 'Labourer', 'Electrician', 'Plumber', 'Welder', 'Painter',
  'Tiler', 'POP / Ceiling installer', 'Roofer', 'Scaffolder', 'Machine operator', 'Driver', 'Engineer', 'Foreman',
  'Supervisor', 'Security',
];
export const WEATHER = ['Sunny', 'Cloudy', 'Rain', 'Wind', 'Snow', 'Heat'];
// Common construction budget lines, offered when adding a line item (any code/description can be typed instead).
export const STANDARD_COST_CODES = [
  { code: '01-000', description: 'Preliminaries & general requirements' },
  { code: '02-000', description: 'Site works & clearing' },
  { code: '03-000', description: 'Substructure & foundations' },
  { code: '04-000', description: 'Concrete works' },
  { code: '05-000', description: 'Masonry & blockwork' },
  { code: '06-000', description: 'Reinforcement & steel works' },
  { code: '07-000', description: 'Carpentry & joinery' },
  { code: '08-000', description: 'Roofing' },
  { code: '09-000', description: 'Doors & windows' },
  { code: '10-000', description: 'Finishes (plaster, tiling, painting, POP)' },
  { code: '11-000', description: 'Plumbing & drainage' },
  { code: '12-000', description: 'Electrical installation' },
  { code: '13-000', description: 'Mechanical (HVAC)' },
  { code: '14-000', description: 'External works & landscaping' },
  { code: '15-000', description: 'Labour' },
  { code: '16-000', description: 'Equipment & plant hire' },
  { code: '17-000', description: 'Professional fees' },
  { code: '18-000', description: 'Permits & approvals' },
  { code: '19-000', description: 'Contingency' },
];
export const EXPENSE_CATEGORIES = ['Materials', 'Labour', 'Equipment', 'Subcontractor', 'Permits & fees', 'Transport', 'Site overheads', 'Other'];
export const EXPENSE_STATUSES = ['Pending', 'Approved', 'Rejected', 'Paid'];
export const PAYMENT_METHODS = ['Bank transfer', 'Cash', 'Card', 'Cheque', 'POS'];
// Chosen by hand; "Part paid" and "Paid" follow automatically from the payments recorded on an invoice.
export const INVOICE_STATUSES = ['Draft', 'Sent'];
export const MATERIAL_STATUSES = ['Requested', 'Ordered', 'Delivered'];
export const EQUIPMENT_STATUSES = ['Scheduled', 'On site', 'Maintenance', 'Returned'];
export const OWNERSHIP = ['Owned', 'Rented'];
export const DOC_FOLDERS = ['Drawings', 'Contracts', 'Permits', 'Specifications', 'Reports', 'Photos', 'Invoices & receipts', 'Other'];

export const LABELS = [
  { name: 'Urgent', color: '#e11d48' },
  { name: 'Safety', color: '#f59e0b' },
  { name: 'Inspection', color: '#7c3aed' },
  { name: 'Client', color: '#0284c7' },
  { name: 'Change', color: '#059669' },
  { name: 'Blocked', color: '#475569' },
];

// Tasks are normalized on load (see normalizeProject in store.jsx), so optional fields can be omitted here.
export const seedProjects = [
  {
    id: 'riverside-medical',
    name: 'Riverside Medical Office Building',
    client: 'Riverside Health Partners',
    location: 'Austin, TX',
    type: 'Healthcare',
    status: 'Active',
    start: '2026-06-01',
    end: '2027-08-30',
    budget: 18500000,
    hue: 210,
    description: 'Four-story, 62,000 sq ft medical office building with structured parking and imaging suite.',
    taskLists: [
      { id: 'structure', name: 'Structure' },
      { id: 'mep', name: 'MEP coordination' },
      { id: 'procurement', name: 'Procurement' },
      { id: 'closeout', name: 'Inspections & closeout' },
    ],
    tasks: [
      { id: 't1', number: 1, listId: 'structure', title: 'Pour level 2 deck', assignees: ['Marcus Lee'], start: '2026-10-12', due: '2026-10-20', progress: 60, priority: 'High', labels: ['Urgent'], status: 'In progress', hours: 14,
        comments: [{ id: 'c1', author: 'Marcus Lee', date: '2026-10-14', text: 'Pump truck confirmed for 6am Tuesday.' }] },
      { id: 't2', number: 2, listId: 'structure', title: 'Steel erection — east bay', assignees: ['Marcus Lee', 'Dana Ortiz'], start: '2026-10-05', due: '2026-11-06', progress: 35, priority: 'Medium', status: 'In progress', hours: 22 },
      { id: 't3', number: 3, listId: 'structure', title: 'Foundation inspection', assignees: ['Dana Ortiz'], start: '2026-08-10', due: '2026-08-12', progress: 100, priority: 'High', labels: ['Inspection'], status: 'Done', hours: 3 },
      { id: 't4', number: 4, listId: 'structure', title: 'Level 3 shoring plan', assignees: ['Priya Shah'], start: '2026-10-21', due: '2026-11-02', priority: 'Medium', labels: ['Safety'], status: 'To do' },
      { id: 't5', number: 5, listId: 'mep', title: 'Review MEP coordination drawings', assignees: ['Priya Shah'], start: '2026-10-08', due: '2026-10-18', progress: 90, priority: 'High', status: 'In review', hours: 9,
        comments: [{ id: 'c2', author: 'Priya Shah', date: '2026-10-13', text: 'Two duct clashes at grid D/6 flagged to the mechanical sub.' }] },
      { id: 't6', number: 6, listId: 'mep', title: 'Underground plumbing rough-in', assignees: ['Priya Shah'], start: '2026-07-14', due: '2026-07-28', progress: 100, priority: 'Medium', status: 'Done', hours: 6 },
      { id: 't7', number: 7, listId: 'mep', title: 'Imaging suite shielding layout', assignees: ['Priya Shah', 'Dana Ortiz'], start: '2026-10-19', due: '2026-11-13', priority: 'Medium', labels: ['Client'], status: 'To do' },
      { id: 't8', number: 8, listId: 'procurement', title: 'Order curtain wall mockup', assignees: ['Dana Ortiz'], start: '2026-10-15', due: '2026-10-30', progress: 20, priority: 'Medium', status: 'In progress', hours: 2 },
      { id: 't9', number: 9, listId: 'procurement', title: 'Approve elevator submittal', assignees: ['Dana Ortiz'], start: '2026-10-01', due: '2026-10-09', progress: 50, priority: 'High', labels: ['Blocked'], status: 'In review' },
      { id: 't10', number: 10, listId: 'procurement', title: 'Price owner-requested canopy', assignees: ['Dana Ortiz'], due: '2026-11-10', priority: 'Low', labels: ['Change', 'Client'], status: 'To do' },
      { id: 't11', number: 11, listId: 'closeout', title: 'Schedule fire marshal walkthrough', assignees: ['Marcus Lee'], due: '2026-11-05', priority: 'Low', labels: ['Inspection'], status: 'To do' },
    ],
    milestones: [
      { id: 'm1', name: 'Notice to proceed', date: '2026-06-01', done: true },
      { id: 'm2', name: 'Foundations complete', date: '2026-08-15', done: true },
      { id: 'm3', name: 'Structure topped out', date: '2026-12-18', done: false },
      { id: 'm4', name: 'Building dried in', date: '2027-03-12', done: false },
      { id: 'm5', name: 'Substantial completion', date: '2027-08-02', done: false },
    ],
    costs: [
      { id: 'c1', code: '03-000', description: 'Concrete', budgeted: 2400000, actual: 1310000 },
      { id: 'c2', code: '05-000', description: 'Structural steel', budgeted: 3100000, actual: 950000 },
      { id: 'c3', code: '22-000', description: 'Plumbing', budgeted: 1250000, actual: 240000 },
      { id: 'c4', code: '26-000', description: 'Electrical', budgeted: 2050000, actual: 180000 },
      { id: 'c5', code: '31-000', description: 'Earthwork', budgeted: 680000, actual: 712000 },
    ],
    rfis: [
      { id: 'r1', number: 1, subject: 'Slab edge detail at grid C/4', assignee: 'Studio Arc Architects', due: '2026-10-21', status: 'Open', question: 'Drawings S-201 and A-301 conflict on slab edge offset. Please confirm dimension.', answer: '' },
      { id: 'r2', number: 2, subject: 'Imaging suite shielding spec', assignee: 'Studio Arc Architects', due: '2026-10-10', status: 'Answered', question: 'Confirm lead-lining thickness for MRI room walls.', answer: 'Use 2.0 mm lead equivalent per physicist report rev B.' },
    ],
    logs: [
      { id: 'l1', date: '2026-10-14', weather: 'Sunny', crew: 46, notes: 'Formwork for level 2 deck 80% complete. Rebar delivery received.' },
      { id: 'l2', date: '2026-10-13', weather: 'Cloudy', crew: 41, notes: 'Steel erection continued on east bay. No incidents.' },
    ],
    team: [
      { id: 'u1', name: 'Dana Ortiz', role: 'Project Manager', company: 'Apex Builders Ltd', email: 'dana@example.com' },
      { id: 'u2', name: 'Marcus Lee', role: 'Superintendent', company: 'Apex Builders Ltd', email: 'marcus@example.com' },
      { id: 'u3', name: 'Priya Shah', role: 'Project Engineer', company: 'Apex Builders Ltd', email: 'priya@example.com' },
    ],
    expenses: [
      { id: 'e1', date: '2026-10-02', description: 'Ready-mix concrete, level 2 deck', category: 'Materials', vendor: 'Lafarge Ready-Mix', costId: 'c1', amount: 186000, paymentMethod: 'Bank transfer', status: 'Paid' },
      { id: 'e2', date: '2026-10-06', description: 'Steel erection crew — week 40', category: 'Labour', vendor: 'Ironline Erectors', costId: 'c2', amount: 74500, paymentMethod: 'Bank transfer', status: 'Approved' },
      { id: 'e3', date: '2026-10-09', description: 'Tower crane rental — October', category: 'Equipment', vendor: 'LiftCo Rentals', amount: 42000, paymentMethod: 'Bank transfer', status: 'Paid' },
      { id: 'e4', date: '2026-10-12', description: 'Building permit revision fee', category: 'Permits & fees', vendor: 'City of Austin', amount: 3800, paymentMethod: 'Card', status: 'Paid' },
      { id: 'e5', date: '2026-10-14', description: 'Rebar delivery haulage', category: 'Transport', vendor: 'Swift Haulage', costId: 'c1', amount: 6200, paymentMethod: 'Cash', status: 'Pending' },
    ],
    invoices: [
      { id: 'i1', number: 1, date: '2026-08-31', due: '2026-09-30', description: 'Progress claim 1 — foundations', amount: 2400000, status: 'Paid', paidDate: '2026-09-24' },
      { id: 'i2', number: 2, date: '2026-09-30', due: '2026-10-30', description: 'Progress claim 2 — structure to level 2', amount: 1850000, status: 'Sent' },
    ],
    materials: [
      { id: 'mt1', name: 'Ready-mix concrete C30', unit: 'm³', quantity: 1200, delivered: 760, used: 720, unitCost: 245, supplier: 'Lafarge Ready-Mix', neededBy: '2026-10-20', status: 'Ordered' },
      { id: 'mt2', name: 'Rebar 16mm', unit: 'tonnes', quantity: 180, delivered: 180, used: 162, unitCost: 1150, supplier: 'Steelworks Supply', neededBy: '2026-10-10', status: 'Delivered' },
      { id: 'mt3', name: 'Structural steel beams', unit: 'tonnes', quantity: 420, delivered: 150, used: 138, unitCost: 2900, supplier: 'Ironline Steel', neededBy: '2026-11-01', status: 'Ordered' },
      { id: 'mt4', name: 'Curtain wall units', unit: 'panels', quantity: 340, delivered: 0, used: 0, unitCost: 1800, supplier: 'ClearView Facades', neededBy: '2027-01-15', status: 'Requested' },
    ],
    equipment: [
      { id: 'q1', name: 'Tower crane TC-1', category: 'Crane', ownership: 'Rented', supplier: 'LiftCo Rentals', dailyRate: 1400, start: '2026-08-20', end: '2027-02-28', status: 'On site', operator: 'Sam Okafor', notes: 'Inspection due monthly' },
      { id: 'q2', name: 'Concrete pump truck', category: 'Concrete', ownership: 'Rented', supplier: 'PumpPro', dailyRate: 950, start: '2026-10-19', end: '2026-10-21', status: 'Scheduled', operator: '', notes: 'Level 2 deck pour' },
      { id: 'q3', name: 'Telehandler 4m', category: 'Lifting', ownership: 'Owned', supplier: '', dailyRate: 0, start: '2026-06-05', end: '', status: 'On site', operator: 'Marcus Lee', notes: '' },
    ],
  },
  {
    id: 'oak-street-lofts',
    name: 'Oak Street Lofts',
    client: 'Oak Street Development LLC',
    location: 'Denver, CO',
    type: 'Residential',
    status: 'Preliminaries',
    start: '2027-01-15',
    end: '2028-03-31',
    budget: 9200000,
    hue: 30,
    description: '48-unit mixed-use residential building with ground-floor retail.',
    taskLists: [
      { id: 'precon', name: 'Preconstruction' },
      { id: 'permits', name: 'Permitting' },
    ],
    tasks: [
      { id: 't1', number: 1, listId: 'precon', title: 'Finalize GMP proposal', assignees: ['Dana Ortiz'], start: '2026-10-05', due: '2026-11-01', progress: 40, priority: 'High', labels: ['Client'], status: 'In progress', hours: 11 },
      { id: 't2', number: 2, listId: 'precon', title: 'Geotechnical report review', assignees: ['Jordan Kim'], start: '2026-10-20', due: '2026-10-25', priority: 'Medium', status: 'To do' },
      { id: 't3', number: 3, listId: 'permits', title: 'Submit building permit set', assignees: ['Jordan Kim', 'Dana Ortiz'], start: '2026-11-02', due: '2026-11-20', priority: 'High', status: 'To do' },
    ],
    milestones: [
      { id: 'm1', name: 'GMP approved', date: '2026-12-01', done: false },
      { id: 'm2', name: 'Permit issued', date: '2027-01-05', done: false },
    ],
    costs: [
      { id: 'c1', code: '01-000', description: 'General requirements', budgeted: 820000, actual: 35000 },
    ],
    rfis: [],
    logs: [],
    team: [
      { id: 'u1', name: 'Dana Ortiz', role: 'Project Manager', company: 'Apex Builders Ltd', email: 'dana@example.com' },
      { id: 'u2', name: 'Jordan Kim', role: 'Estimator', company: 'Apex Builders Ltd', email: 'jordan@example.com' },
    ],
  },
];
