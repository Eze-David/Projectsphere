import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell.jsx';
import NotFound from './pages/NotFound.jsx';
import { ProjectLayout, ProjectsList } from './pages/projects.jsx';
import { TasksView } from './pages/tasks.jsx';
import { CalendarView, GanttView } from './pages/planning.jsx';
import { Budget, DailyLogs, Milestones, Overview, Rfis, Team } from './pages/sections.jsx';
import { MyTasks, People, Reports } from './pages/workspace.jsx';
import { Expenses, Finance } from './pages/money.jsx';
import { Equipment, Materials } from './pages/site.jsx';
import { Documents } from './pages/documents.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/projects" replace />} />
        <Route path="me" element={<MyTasks />} />
        <Route path="reports" element={<Reports />} />
        <Route path="people" element={<People />} />
        <Route path="projects" element={<ProjectsList />} />
        <Route path="projects/:id" element={<ProjectLayout />}>
          <Route index element={<Navigate to="tasks" replace />} />
          <Route path="tasks" element={<TasksView />} />
          <Route path="tasks/:listId" element={<TasksView />} />
          <Route path="gantt" element={<GanttView />} />
          <Route path="calendar" element={<CalendarView />} />
          <Route path="milestones" element={<Milestones />} />
          <Route path="finance" element={<Finance />} />
          <Route path="budget" element={<Budget />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="materials" element={<Materials />} />
          <Route path="equipment" element={<Equipment />} />
          <Route path="documents" element={<Documents />} />
          <Route path="rfis" element={<Rfis />} />
          <Route path="logs" element={<DailyLogs />} />
          <Route path="team" element={<Team />} />
          <Route path="overview" element={<Overview />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
