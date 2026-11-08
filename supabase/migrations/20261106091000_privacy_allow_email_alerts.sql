-- Allow the new privacy.email_alerts switch
create or replace function public.valid_privacy(p jsonb)
 returns boolean language sql immutable set search_path to 'public' as $function$
  select jsonb_typeof(p) = 'object'
     and not exists (
       select 1 from jsonb_each(p) e
       where e.key not in ('hide_age', 'hide_distance', 'stealth', 'quiet_hours', 'video_off', 'blur_media',
                           'hide_response_insight', 'hide_from_community_insights', 'hide_from_age_insights', 'email_alerts')
          or jsonb_typeof(e.value) <> 'boolean')
$function$;
