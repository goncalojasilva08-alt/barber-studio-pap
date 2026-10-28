-- ==============================================================================
-- BARBER STUDIO — Dados fictícios para a demonstração (PAP)
-- Correr no SQL Editor do projeto da demo DEPOIS de bd-portugues.sql.
-- Cria 6 clientes inventados e marcações em vários estados, com datas
-- calculadas a partir de hoje (passado, hoje e próximos dias).
-- Pode correr-se de novo: apaga primeiro os dados fictícios anteriores.
-- ==============================================================================

-- Limpa a demo anterior (só as contas @barberstudio.demo e as suas marcações)
DELETE FROM public.marcacoes
 WHERE cliente_id IN (SELECT id FROM public.perfis WHERE email LIKE '%@barberstudio.demo');
DELETE FROM public.avaliacoes
 WHERE cliente_id IN (SELECT id FROM public.perfis WHERE email LIKE '%@barberstudio.demo');
DELETE FROM auth.users WHERE email LIKE '%@barberstudio.demo';

DO $$
DECLARE
  -- Clientes fictícios: nome, email, telemóvel
  clientes TEXT[][] := ARRAY[
    ['João Ferreira',  'joao.ferreira@barberstudio.demo',  '910000001'],
    ['Miguel Santos',  'miguel.santos@barberstudio.demo',  '910000002'],
    ['Tiago Rodrigues','tiago.rodrigues@barberstudio.demo','910000003'],
    ['André Costa',    'andre.costa@barberstudio.demo',    '910000004'],
    ['Rafael Gomes',   'rafael.gomes@barberstudio.demo',   '910000005'],
    ['Diogo Martins',  'diogo.martins@barberstudio.demo',  '910000006']
  ];
  ids UUID[] := ARRAY[]::UUID[];
  novo UUID;
  corte UUID; corte_barba UUID; barba UUID; fade UUID;
  i INT;
  -- Próximo dia útil (salta sábados, que fecham às 18:00)
  d1 DATE; d2 DATE; d3 DATE;
BEGIN
  -- 1. Contas (o gatilho ao_criar_utilizador cria o perfil de cada uma como cliente)
  FOR i IN 1 .. array_length(clientes, 1) LOOP
    novo := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      novo, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      clientes[i][2], extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('name', clientes[i][1], 'phone', clientes[i][3]),
      now() - make_interval(days => 60 - i * 5), now(),
      '', '', '', ''
    );
    ids := ids || novo;
  END LOOP;

  SELECT id INTO corte       FROM public.servicos WHERE nome = 'Corte Clássico';
  SELECT id INTO corte_barba FROM public.servicos WHERE nome = 'Corte + Barba';
  SELECT id INTO barba       FROM public.servicos WHERE nome = 'Barba';
  SELECT id INTO fade        FROM public.servicos WHERE nome = 'Skin Fade';

  d1 := current_date + CASE WHEN extract(dow FROM current_date + 1) = 6 THEN 2 ELSE 1 END;
  d2 := d1 + CASE WHEN extract(dow FROM d1 + 1) = 6 THEN 2 ELSE 1 END;
  d3 := d2 + CASE WHEN extract(dow FROM d2 + 1) = 6 THEN 2 ELSE 1 END;

  -- 2. Histórico: cortes já feitos (contam para a faturação)
  INSERT INTO public.marcacoes (cliente_id, servico_id, data, hora, estado, criado_em) VALUES
    (ids[1], corte_barba, current_date - 21, '18:00', 'CONCLUÍDA', now() - interval '25 days'),
    (ids[2], fade,        current_date - 18, '17:30', 'CONCLUÍDA', now() - interval '22 days'),
    (ids[3], corte,       current_date - 14, '19:00', 'CONCLUÍDA', now() - interval '16 days'),
    (ids[4], corte_barba, current_date - 10, '18:30', 'CONCLUÍDA', now() - interval '12 days'),
    (ids[1], corte,       current_date - 7,  '20:00', 'CONCLUÍDA', now() - interval '9 days'),
    (ids[5], barba,       current_date - 5,  '18:00', 'CONCLUÍDA', now() - interval '6 days'),
    (ids[2], corte_barba, current_date - 3,  '19:30', 'CONCLUÍDA', now() - interval '4 days');

  -- Cancelamentos (um pelo cliente, outro pelo barbeiro)
  INSERT INTO public.marcacoes (cliente_id, servico_id, data, hora, estado, cancelada_por, cancelamento_visto, criado_em) VALUES
    (ids[6], corte, current_date - 4, '18:00', 'CANCELADA', 'cliente', true, now() - interval '6 days'),
    (ids[3], fade,  current_date - 2, '17:30', 'CANCELADA', 'admin',   true, now() - interval '5 days');

  -- 3. Hoje e próximos dias
  INSERT INTO public.marcacoes (cliente_id, servico_id, data, hora, estado, notas, criado_em) VALUES
    (ids[4], fade,        current_date, '19:00', 'CONFIRMADA', '',                           now() - interval '2 days'),
    (ids[5], corte_barba, current_date, '20:00', 'CONFIRMADA', 'Barba mais curta dos lados', now() - interval '1 day'),
    (ids[1], corte,       d1,           '18:00', 'CONFIRMADA', '',                           now() - interval '1 day'),
    (ids[6], corte_barba, d1,           '19:00', 'PENDENTE',   'Primeira vez no estúdio',    now() - interval '3 hours'),
    (ids[3], barba,       d2,           '18:30', 'PENDENTE',   '',                           now() - interval '1 hour'),
    (ids[2], fade,        d3,           '19:30', 'PENDENTE',   '',                           now() - interval '30 minutes');

  -- 4. Avaliações dos clientes
  INSERT INTO public.avaliacoes (cliente_id, classificacao, comentario) VALUES
    (ids[1], 5, 'Atendimento impecável, saí com o corte exatamente como queria.'),
    (ids[2], 5, 'O melhor fade que já fiz. Muito atencioso.'),
    (ids[4], 4, 'Excelente trabalho, só demorou um pouco mais do que esperava.');
END $$;

-- Resumo do que ficou criado
SELECT estado, count(*) AS marcacoes FROM public.marcacoes GROUP BY estado ORDER BY estado;
