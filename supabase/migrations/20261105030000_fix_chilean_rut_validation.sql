create or replace function public.valid_chilean_rut(p_rut text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalized text := upper(regexp_replace(coalesce(p_rut, ''), '[.\s-]', '', 'g'));
  body text;
  provided_digit text;
  multiplier integer := 2;
  checksum integer := 0;
  result integer;
  expected_digit text;
  digit_index integer;
begin
  if normalized !~ '^[0-9]{7,8}[0-9K]$' then return false; end if;
  body := left(normalized, length(normalized) - 1);
  provided_digit := right(normalized, 1);
  for digit_index in 1..length(body) loop
    checksum := checksum
      + substring(body from length(body) - digit_index + 1 for 1)::integer * multiplier;
    multiplier := case when multiplier = 7 then 2 else multiplier + 1 end;
  end loop;
  result := 11 - (checksum % 11);
  expected_digit := case when result = 11 then '0' when result = 10 then 'K' else result::text end;
  return expected_digit = provided_digit;
end;
$$;
