-- ==============================================================================
-- BARBER STUDIO — Base de dados completa (versão PAP, nomes em português)
-- Correr UMA vez no SQL Editor do projeto Supabase da demo (barber-studio-pap).
-- Cria: tabelas, regras de segurança (RLS), funções, gatilhos, armazenamento de
-- fotos, tempo real e os dados base (serviços, horário, perfil do barbeiro).
-- ==============================================================================


-- ------------------------------------------------------------------------------
-- 1. TABELAS
-- ------------------------------------------------------------------------------

-- Perfil de cada conta (cliente, barbeiro ou admin). Nasce com o registo.
CREATE TABLE public.perfis (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome             TEXT,
  email            TEXT,
  telemovel        TEXT,
  tipo_utilizador  TEXT NOT NULL DEFAULT 'cliente'
                   CHECK (tipo_utilizador IN ('barbeiro', 'admin', 'cliente')),
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dados públicos do barbeiro e do estúdio (uma só linha)
CREATE TABLE public.perfil_barbeiro (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                TEXT NOT NULL DEFAULT 'Rui',
  biografia           TEXT DEFAULT 'Especialista em visagismo e cortes de precisão na Madeira. Atendimento 100% exclusivo e individualizado.',
  foto_url            TEXT DEFAULT 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=900&q=85',
  nome_estudio        TEXT DEFAULT 'Barber Studio',
  email               TEXT DEFAULT 'contacto@barberstudio.demo',
  site_url            TEXT,
  latitude            NUMERIC,
  longitude           NUMERIC,
  mapa_embed_url      TEXT,
  seo_titulo          TEXT,
  seo_descricao       TEXT,
  seo_palavras_chave  TEXT,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Catálogo de serviços (corte, barba, ...)
CREATE TABLE public.servicos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome             TEXT NOT NULL,
  categoria        TEXT NOT NULL DEFAULT 'CORTE',
  descricao        TEXT DEFAULT '',
  preco            NUMERIC NOT NULL DEFAULT 0,
  duracao_minutos  INTEGER NOT NULL DEFAULT 30,
  ativo            BOOLEAN NOT NULL DEFAULT true,
  destaque         BOOLEAN NOT NULL DEFAULT false,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Marcações dos clientes
CREATE TABLE public.marcacoes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id          UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  servico_id          UUID REFERENCES public.servicos(id) ON DELETE SET NULL,
  data                DATE NOT NULL,
  hora                TEXT NOT NULL DEFAULT '09:30',
  estado              TEXT NOT NULL DEFAULT 'PENDENTE'
                      CHECK (estado IN ('PENDENTE', 'CONFIRMADA', 'CONCLUÍDA', 'CANCELADA')),
  notas               TEXT DEFAULT '',
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelada_por       TEXT,                           -- 'cliente' ou 'admin'
  cancelamento_visto  BOOLEAN NOT NULL DEFAULT false  -- a outra parte já viu o aviso?
);

-- Nunca duas marcações ativas no mesmo dia e hora
CREATE UNIQUE INDEX marcacoes_hora_unica ON public.marcacoes (data, hora) WHERE estado <> 'CANCELADA';

-- Fotos da galeria (lookbook)
CREATE TABLE public.galeria (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imagem_url   TEXT NOT NULL,
  titulo       TEXT DEFAULT '',
  descricao    TEXT DEFAULT '',
  categoria    TEXT NOT NULL DEFAULT 'cortes',   -- cortes | barba | detalhes
  tipo_layout  TEXT NOT NULL DEFAULT 'normal',   -- normal | alto | largo
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Avaliações dos clientes (1 a 5 estrelas)
CREATE TABLE public.avaliacoes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id      UUID NOT NULL,
  marcacao_id     UUID,
  classificacao   INTEGER NOT NULL CHECK (classificacao BETWEEN 1 AND 5),
  comentario      TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Horário semanal (0 = domingo ... 6 = sábado)
CREATE TABLE public.horario_funcionamento (
  dia_semana      SMALLINT PRIMARY KEY CHECK (dia_semana BETWEEN 0 AND 6),
  aberto          BOOLEAN NOT NULL DEFAULT false,
  hora_abertura   TIME NOT NULL DEFAULT '09:00',
  hora_fecho      TIME NOT NULL DEFAULT '18:00',
  pausas          JSONB NOT NULL DEFAULT '[]',     -- [{"inicio":"12:45","fim":"14:00"}]
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (hora_fecho > hora_abertura)
);

-- Folgas, férias e feriados (dia inteiro ou só algumas horas)
CREATE TABLE public.folgas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_inicio  DATE NOT NULL,
  data_fim     DATE NOT NULL,
  hora_inicio  TIME,
  hora_fim     TIME,
  tipo         TEXT NOT NULL DEFAULT 'FOLGA' CHECK (tipo IN ('FOLGA', 'FERIAS', 'FERIADO')),
  motivo       TEXT,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (data_fim >= data_inicio),
  CHECK ((hora_inicio IS NULL AND hora_fim IS NULL)
      OR (hora_inicio IS NOT NULL AND hora_fim IS NOT NULL AND hora_fim > hora_inicio))
);
CREATE INDEX folgas_datas ON public.folgas (data_inicio, data_fim);

-- Interruptor geral: o barbeiro pode fechar as marcações online
CREATE TABLE public.definicoes_marcacoes (
  id                 SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  marcacoes_abertas  BOOLEAN NOT NULL DEFAULT true,
  atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ------------------------------------------------------------------------------
-- 2. FUNÇÕES DE PERMISSÕES (quem é quem)
-- ------------------------------------------------------------------------------

-- O dono do estúdio (o barbeiro principal)
CREATE FUNCTION public.e_barbeiro() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND tipo_utilizador = 'barbeiro');
$$;

-- Outros barbeiros da equipa
CREATE FUNCTION public.e_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND tipo_utilizador = 'admin');
$$;

-- Qualquer pessoa da equipa (dono ou admin)
CREATE FUNCTION public.e_equipa() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND tipo_utilizador IN ('barbeiro', 'admin'));
$$;


-- ------------------------------------------------------------------------------
-- 3. GATILHOS
-- ------------------------------------------------------------------------------

-- Ao registar uma conta, cria o perfil (sempre como cliente)
CREATE FUNCTION public.criar_perfil_novo_utilizador() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.perfis (id, email, nome, telemovel, tipo_utilizador)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    'cliente'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ao_criar_utilizador
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.criar_perfil_novo_utilizador();

-- Só o dono muda o tipo de utilizador: um cliente não se pode promover a si próprio
CREATE FUNCTION public.proteger_tipo_utilizador() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.e_barbeiro() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.tipo_utilizador := 'cliente';
  ELSE
    NEW.tipo_utilizador := OLD.tipo_utilizador;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER proteger_tipo_utilizador
  BEFORE INSERT OR UPDATE ON public.perfis
  FOR EACH ROW EXECUTE FUNCTION public.proteger_tipo_utilizador();

-- Regras de marcação: sem sobreposições e no máximo 2 marcações ativas por cliente
CREATE FUNCTION public.verificar_regras_marcacao() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_duracao  INT;
  v_inicio   TIME;
  v_fim      TIME;
  v_ativas   INT;
BEGIN
  -- Só interessa quando nasce uma marcação ou muda de dia/hora
  IF TG_OP = 'UPDATE' AND NEW.data = OLD.data AND NEW.hora = OLD.hora THEN
    RETURN NEW;
  END IF;
  IF NEW.estado IN ('CANCELADA', 'CONCLUÍDA') THEN
    RETURN NEW;
  END IF;

  -- Uma marcação de cada vez por dia: dois pedidos ao mesmo tempo não passam os dois
  PERFORM pg_advisory_xact_lock(hashtext('marcacao-' || NEW.data::text));

  SELECT duracao_minutos INTO v_duracao FROM public.servicos WHERE id = NEW.servico_id;
  v_duracao := COALESCE(v_duracao, 30);
  v_inicio := NEW.hora::time;
  v_fim := v_inicio + make_interval(mins => v_duracao);

  IF EXISTS (
    SELECT 1
    FROM public.marcacoes m
    LEFT JOIN public.servicos s ON s.id = m.servico_id
    WHERE m.id <> NEW.id
      AND m.data = NEW.data
      AND m.estado <> 'CANCELADA'
      AND m.hora::time < v_fim
      AND m.hora::time + make_interval(mins => COALESCE(s.duracao_minutos, 30)) > v_inicio
  ) THEN
    -- 23505: o site mostra "Este horário acabou de ser reservado"
    RAISE EXCEPTION 'Este horário acabou de ser reservado. Por favor escolhe outro.'
      USING ERRCODE = '23505';
  END IF;

  IF TG_OP = 'INSERT' AND NOT public.e_equipa() THEN
    SELECT count(*) INTO v_ativas
    FROM public.marcacoes
    WHERE cliente_id = NEW.cliente_id
      AND estado IN ('PENDENTE', 'CONFIRMADA')
      AND data >= current_date;
    IF v_ativas >= 2 THEN
      RAISE EXCEPTION 'Já tens 2 marcações ativas. Para marcares outra, espera que uma passe ou cancela-a na tua área de cliente.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER verificar_regras_marcacao
  BEFORE INSERT OR UPDATE ON public.marcacoes
  FOR EACH ROW EXECUTE FUNCTION public.verificar_regras_marcacao();


-- ------------------------------------------------------------------------------
-- 4. FUNÇÕES CHAMADAS PELO SITE
-- (SECURITY DEFINER: devolvem só o necessário, sem expor dados de outros clientes)
-- ------------------------------------------------------------------------------

-- Horas ocupadas num dia, com a duração de cada serviço (para o calendário)
CREATE FUNCTION public.horarios_ocupados(p_data DATE)
RETURNS TABLE (hora_inicio TEXT, duracao_minutos INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT left(m.hora, 5), COALESCE(s.duracao_minutos, 30)
  FROM public.marcacoes m
  LEFT JOIN public.servicos s ON s.id = m.servico_id
  WHERE m.data = p_data AND m.estado <> 'CANCELADA'
  ORDER BY 1;
$$;

-- Versão simples: só as horas de início
CREATE FUNCTION public.horas_ocupadas(p_data DATE)
RETURNS SETOF TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.hora FROM public.marcacoes m
  WHERE m.data = p_data AND m.estado <> 'CANCELADA'
  ORDER BY 1;
$$;

-- Login pelo nome: devolve o email só se o nome for único
CREATE FUNCTION public.email_para_login(p_nome TEXT)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN count(*) = 1 THEN min(p.email) END
  FROM public.perfis p
  WHERE btrim(coalesce(p_nome, '')) <> ''
    AND p.email IS NOT NULL
    AND lower(btrim(p.nome)) = lower(btrim(p_nome));
$$;

-- Nº de marcações por serviço nos últimos 90 dias (selo "Mais pedido")
CREATE FUNCTION public.popularidade_servicos()
RETURNS TABLE (servico_id TEXT, total BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.servico_id::text, count(*)::bigint
  FROM public.marcacoes m
  WHERE m.estado <> 'CANCELADA' AND m.data >= current_date - 90
  GROUP BY 1;
$$;


-- ------------------------------------------------------------------------------
-- 5. SEGURANÇA (RLS): quem pode ler e alterar cada tabela
-- ------------------------------------------------------------------------------

ALTER TABLE public.perfis                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfil_barbeiro       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servicos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marcacoes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.galeria               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avaliacoes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horario_funcionamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folgas                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.definicoes_marcacoes  ENABLE ROW LEVEL SECURITY;

-- Perfis: cada um vê e edita o seu; a equipa vê e edita todos
CREATE POLICY "Ver o próprio perfil ou equipa vê todos" ON public.perfis
  FOR SELECT USING (auth.uid() = id OR public.e_equipa());
CREATE POLICY "Criar o próprio perfil" ON public.perfis
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Editar o próprio perfil ou equipa edita todos" ON public.perfis
  FOR UPDATE USING (auth.uid() = id OR public.e_equipa())
  WITH CHECK (auth.uid() = id OR public.e_equipa());

-- Perfil do barbeiro: público para ler, só o dono altera
CREATE POLICY "Perfil do barbeiro é público" ON public.perfil_barbeiro
  FOR SELECT USING (true);
CREATE POLICY "Só o dono altera o perfil do barbeiro" ON public.perfil_barbeiro
  FOR ALL TO authenticated USING (public.e_barbeiro()) WITH CHECK (public.e_barbeiro());

-- Serviços: públicos para ler, a equipa gere
CREATE POLICY "Serviços são públicos" ON public.servicos
  FOR SELECT USING (true);
CREATE POLICY "Equipa gere os serviços" ON public.servicos
  FOR ALL TO authenticated USING (public.e_equipa()) WITH CHECK (public.e_equipa());

-- Marcações: o cliente vê, cria e altera as suas; a equipa gere todas
CREATE POLICY "Cliente vê as suas, equipa vê todas" ON public.marcacoes
  FOR SELECT TO authenticated USING (auth.uid() = cliente_id OR public.e_equipa());
CREATE POLICY "Cliente marca para si, equipa marca para qualquer um" ON public.marcacoes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = cliente_id OR public.e_equipa());
CREATE POLICY "Cliente altera as suas, equipa altera todas" ON public.marcacoes
  FOR UPDATE TO authenticated USING (auth.uid() = cliente_id OR public.e_equipa())
  WITH CHECK (auth.uid() = cliente_id OR public.e_equipa());
CREATE POLICY "Só a equipa apaga marcações" ON public.marcacoes
  FOR DELETE TO authenticated USING (public.e_equipa());

-- Galeria: pública para ler, a equipa gere
CREATE POLICY "Galeria é pública" ON public.galeria
  FOR SELECT USING (true);
CREATE POLICY "Equipa gere a galeria" ON public.galeria
  FOR ALL TO authenticated USING (public.e_equipa()) WITH CHECK (public.e_equipa());

-- Avaliações: públicas para ler, cada cliente cria e edita as suas
CREATE POLICY "Avaliações são públicas" ON public.avaliacoes
  FOR SELECT USING (true);
CREATE POLICY "Cliente cria as suas avaliações" ON public.avaliacoes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = cliente_id);
CREATE POLICY "Cliente edita as suas avaliações" ON public.avaliacoes
  FOR UPDATE TO authenticated USING (auth.uid() = cliente_id);

-- Horário, folgas e interruptor: públicos para ler, a equipa gere
CREATE POLICY "Horário é público" ON public.horario_funcionamento
  FOR SELECT USING (true);
CREATE POLICY "Equipa gere o horário" ON public.horario_funcionamento
  FOR ALL TO authenticated USING (public.e_equipa()) WITH CHECK (public.e_equipa());

CREATE POLICY "Folgas são públicas" ON public.folgas
  FOR SELECT USING (true);
CREATE POLICY "Equipa gere as folgas" ON public.folgas
  FOR ALL TO authenticated USING (public.e_equipa()) WITH CHECK (public.e_equipa());

CREATE POLICY "Definições são públicas" ON public.definicoes_marcacoes
  FOR SELECT USING (true);
CREATE POLICY "Equipa gere as definições" ON public.definicoes_marcacoes
  FOR ALL TO authenticated USING (public.e_equipa()) WITH CHECK (public.e_equipa());


-- ------------------------------------------------------------------------------
-- 6. FOTOS (Supabase Storage): pasta pública "galeria"
-- ------------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public) VALUES ('galeria', 'galeria', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Fotos da galeria são públicas" ON storage.objects
  FOR SELECT USING (bucket_id = 'galeria');
CREATE POLICY "Equipa envia e gere fotos" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'galeria' AND public.e_equipa())
  WITH CHECK (bucket_id = 'galeria' AND public.e_equipa());


-- ------------------------------------------------------------------------------
-- 7. TEMPO REAL: o painel e a área de cliente atualizam sem recarregar
-- ------------------------------------------------------------------------------

ALTER PUBLICATION supabase_realtime ADD TABLE public.marcacoes;


-- ------------------------------------------------------------------------------
-- 8. DADOS BASE
-- ------------------------------------------------------------------------------

INSERT INTO public.perfil_barbeiro (nome, nome_estudio) VALUES ('Rui', 'Barber Studio');

INSERT INTO public.servicos (nome, categoria, descricao, preco, duracao_minutos) VALUES
  ('Corte Clássico', 'CORTE', 'Consultoria de estilo, corte de precisão à tesoura ou máquina e finalização personalizada.', 8, 30),
  ('Corte + Barba', 'EXPERIÊNCIA COMPLETA', 'Corte de cabelo completo combinado com alinhamento e acabamento de barba à navalha.', 10, 50),
  ('Barba', 'BARBA', 'Alinhamento e contorno de barba à navalha, com toalha quente.', 5, 20),
  ('Skin Fade', 'CORTE', 'Degradê até à pele com transição suave e acabamento à navalha.', 10, 40);

INSERT INTO public.horario_funcionamento (dia_semana, aberto, hora_abertura, hora_fecho, pausas) VALUES
  (0, true,  '17:00', '21:00', '[]'),
  (1, true,  '17:30', '21:00', '[]'),
  (2, true,  '17:30', '21:00', '[]'),
  (3, true,  '17:30', '21:00', '[]'),
  (4, true,  '17:30', '21:00', '[]'),
  (5, true,  '17:30', '21:00', '[]'),
  (6, true,  '09:00', '18:00', '[{"inicio":"12:45","fim":"14:00"}]');

INSERT INTO public.definicoes_marcacoes (id, marcacoes_abertas) VALUES (1, true);
