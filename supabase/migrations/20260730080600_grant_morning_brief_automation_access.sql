grant usage on schema public to service_role;

grant select on table
  public.jarvis_profiles,
  public.life_areas,
  public.goals,
  public.memories,
  public.tasks
to service_role;

grant select, update on table
  public.microsoft_connections
to service_role;

grant select, insert, update on table
  public.morning_briefings
to service_role;
