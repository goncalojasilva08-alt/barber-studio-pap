-- ============================================================================
-- 1) Cada marcação fica ligada ao barbeiro que a atende (perfil_barbeiro).
-- 2) Cada serviço pode ter uma foto, mostrada nos passos da marcação.
-- Correr UMA vez no Supabase da demo: SQL Editor → colar → Run.
-- ============================================================================

-- Marcação → barbeiro (N : 1). Se o barbeiro for apagado, a marcação fica.
ALTER TABLE public.marcacoes
  ADD COLUMN IF NOT EXISTS barbeiro_id UUID REFERENCES public.perfil_barbeiro(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS marcacoes_barbeiro ON public.marcacoes (barbeiro_id);

-- As marcações que já existem passam a ser do barbeiro do estúdio
UPDATE public.marcacoes
SET barbeiro_id = (SELECT id FROM public.perfil_barbeiro ORDER BY criado_em LIMIT 1)
WHERE barbeiro_id IS NULL;

-- Marcações novas: o barbeiro é atribuído automaticamente
-- (o estúdio só tem um barbeiro, por isso o cliente não precisa de o escolher)
CREATE OR REPLACE FUNCTION public.atribuir_barbeiro() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.barbeiro_id IS NULL THEN
    SELECT id INTO NEW.barbeiro_id FROM public.perfil_barbeiro ORDER BY criado_em LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS atribuir_barbeiro ON public.marcacoes;
CREATE TRIGGER atribuir_barbeiro
  BEFORE INSERT ON public.marcacoes
  FOR EACH ROW EXECUTE FUNCTION public.atribuir_barbeiro();

-- Foto de cada serviço (endereço no Storage, pasta "servicos" dentro de "galeria")
ALTER TABLE public.servicos ADD COLUMN IF NOT EXISTS imagem_url TEXT;
