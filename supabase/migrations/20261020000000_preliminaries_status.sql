-- Rename the "Pre-construction" project status to "Preliminaries".
update public.projects set status = 'Preliminaries' where status = 'Pre-construction';
alter table public.projects alter column status set default 'Preliminaries';
