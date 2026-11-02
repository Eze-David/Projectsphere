-- Only a project's owners can see or change its contract value.
drop policy "budget readers" on public.contract_values;
drop policy "settings editors add" on public.contract_values;
drop policy "settings editors update" on public.contract_values;

create policy "owners read" on public.contract_values for select using (is_owner(project_id));
create policy "owners add" on public.contract_values for insert with check (is_owner(project_id));
create policy "owners update" on public.contract_values for update using (is_owner(project_id)) with check (is_owner(project_id));
