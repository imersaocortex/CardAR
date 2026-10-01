begin;
alter table public.projects add column if not exists tracking_mode text not null default 'marker'
  check (tracking_mode in ('marker', 'surface', 'gps'));
alter table public.projects add column if not exists latitude double precision check (latitude between -90 and 90);
alter table public.projects add column if not exists longitude double precision check (longitude between -180 and 180);
alter table public.projects add column if not exists activation_radius double precision not null default 100 check (activation_radius between 10 and 5000);
alter table public.projects add constraint projects_gps_coordinates check (tracking_mode <> 'gps' or (latitude is not null and longitude is not null));
commit;
