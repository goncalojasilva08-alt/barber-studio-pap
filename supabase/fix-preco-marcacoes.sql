-- ============================================================================
-- Faturação estimada fixa: cada marcação guarda o nome e o preço do serviço
-- no momento em que foi feita. Apagar um serviço ou mudar o preço já não
-- altera a faturação; só muda quando o barbeiro altera o histórico
-- (ex.: marcar como concluída ou cancelada).
-- Correr UMA vez no Supabase: SQL Editor → colar → Run.
-- ============================================================================

ALTER TABLE public.marcacoes ADD COLUMN IF NOT EXISTS servico_nome TEXT;
ALTER TABLE public.marcacoes ADD COLUMN IF NOT EXISTS preco NUMERIC;

-- Preenche as marcações que já existem (só as que ainda têm o serviço)
UPDATE public.marcacoes m
SET servico_nome = s.nome, preco = s.preco
FROM public.servicos s
WHERE m.servico_id = s.id AND m.preco IS NULL;

-- Novas marcações: copia nome e preço automaticamente ao criar
-- (ou se o serviço da marcação for trocado)
CREATE OR REPLACE FUNCTION public.copiar_preco_servico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.servico_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.servico_id IS DISTINCT FROM OLD.servico_id) THEN
    SELECT nome, preco INTO NEW.servico_nome, NEW.preco
    FROM public.servicos WHERE id = NEW.servico_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marcacoes_copiar_preco ON public.marcacoes;
CREATE TRIGGER marcacoes_copiar_preco
  BEFORE INSERT OR UPDATE OF servico_id ON public.marcacoes
  FOR EACH ROW EXECUTE FUNCTION public.copiar_preco_servico();
