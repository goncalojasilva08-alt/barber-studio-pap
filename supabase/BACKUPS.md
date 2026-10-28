# Cópias de segurança (backups) — Barber Studio

O plano gratuito do Supabase **não guarda cópias automáticas** que se possam
repor. Se alguém apagar marcações por engano, ou o projeto se estragar, só se
recupera o que tiver sido exportado à mão. Este guia explica como.

## O que há para guardar

| O quê | Onde está | Importância |
|---|---|---|
| Marcações | tabela `appointments` | Alta — é a agenda |
| Clientes (nome, email, telemóvel) | tabela `profiles` | Alta |
| Serviços e preços | tabela `services` | Média — refaz-se à mão em minutos |
| Horário, pausas e bloqueios | `business_hours`, `time_off`, `booking_settings` | Média |
| Perfil do barbeiro | tabela `barber_profile` | Baixa |
| Galeria (lista de fotos) | tabela `gallery` | Média |
| Galeria (as fotos em si) | Storage, bucket `gallery` | Média — o Rui tem os originais? |
| Contas e passwords | `auth.users` (zona interna do Supabase) | Só a opção C as guarda |
| Estrutura (tabelas, regras, funções) | ficheiros `.sql` desta pasta | Já está guardada no GitHub |

## Opção A — Exportar tabela a tabela no painel (a mais simples)

**Trabalho:** 5 a 10 minutos de cada vez. Não é preciso instalar nada.

1. Abrir o projeto em https://supabase.com/dashboard → **Table Editor**.
2. Escolher a tabela `appointments`.
3. Botão **Export** (canto superior direito da tabela) → **Export to CSV**.
4. Repetir para `profiles`, `services`, `business_hours`, `time_off`,
   `booking_settings`, `barber_profile` e `gallery`.
5. Guardar os ficheiros numa pasta com a data, por exemplo
   `Backups Rui/2026-10-12/`, **fora** da pasta do site (para nunca irem
   parar ao GitHub: têm dados pessoais de clientes).

**Limites:** não guarda as contas nem as passwords. Para repor, importa-se
cada CSV no Table Editor (**Insert → Import data from CSV**), mas os clientes
teriam de criar conta outra vez. Chega para não perder a agenda.

## Opção B — Uma só consulta no SQL Editor

**Trabalho:** 2 minutos de cada vez. Dá um único ficheiro, bom para "ter a
agenda guardada", mas não serve para repor a base de dados tal e qual.

1. **SQL Editor** → colar e correr:

   ```sql
   SELECT a.date::date        AS dia,
          left(a.time::text, 5) AS hora,
          a.status            AS estado,
          p.name              AS cliente,
          p.phone             AS telemovel,
          p.email             AS email,
          s.name              AS servico,
          s.price             AS preco,
          a.notes             AS notas
   FROM public.appointments a
   LEFT JOIN public.profiles p ON p.id = a.client_id
   LEFT JOIN public.services s ON s.id = a.service_id
   ORDER BY a.date::date DESC, a.time::text DESC;
   ```

2. Por baixo do resultado: **Export → Download CSV**.

(Só lê dados, pode ser corrida as vezes que for preciso.)

## Opção C — Cópia completa com `pg_dump` (a única que guarda tudo)

**Trabalho:** cerca de 20 minutos na primeira vez (instalar e acertar a
ligação); depois é um comando de 1 minuto. Guarda tudo: dados, estrutura,
contas e passwords (cifradas). É a única que permite repor o site exatamente
como estava.

1. Instalar o PostgreSQL para Windows (https://www.postgresql.org/download/windows/);
   só interessam as "Command Line Tools".
2. No painel do Supabase, botão **Connect** (no topo) → copiar a ligação
   **Session pooler** e substituir `[YOUR-PASSWORD]` pela password da base de
   dados (se não a souberes: **Project Settings → Database → Reset database
   password**; isto não afeta o site, que usa outras chaves).
3. Na linha de comandos:

   ```bash
   pg_dump "COLA-AQUI-A-LIGACAO" --format=custom --file=barberstudio-2026-10-12.dump
   ```

4. Para repor (num projeto novo ou no mesmo):

   ```bash
   pg_restore --clean --if-exists --no-owner --dbname "COLA-AQUI-A-LIGACAO" barberstudio-2026-10-12.dump
   ```

**Atenção:** a ligação tem a password da base de dados. Nunca a escrevas num
ficheiro dentro da pasta do site.

## As fotos da galeria

Não vão em nenhuma das opções acima (ficam no Storage, não na base de dados).

**Trabalho:** 2 minutos. **Storage → gallery →** abrir as pastas `lookbook` e
`barber` → selecionar tudo → **Download**. Só é preciso repetir quando houver
fotos novas.

## Opção D — Backups automáticos do Supabase (plano Pro)

**Trabalho:** nenhum. **Custo:** o plano Pro é pago (cerca de 25 USD por mês;
confirmar o preço atual em https://supabase.com/pricing). Faz uma cópia por
dia e guarda os últimos 7 dias, que se repõem com um clique. Não inclui as
fotos do Storage. Não mexemos nisto agora; fica como decisão para o
lançamento.

## Quando fazer

| Fase | Sugestão |
|---|---|
| Testes (agora) | Não é preciso: os dados são de teste |
| Depois do lançamento, plano gratuito | Opção A ou B uma vez por semana (por exemplo ao domingo) + opção C uma vez por mês |
| Antes de correr qualquer ficheiro `.sql` novo | Opção A, pelo menos à tabela `appointments` |

## Outra coisa a saber sobre o plano gratuito

Um projeto gratuito do Supabase é **posto em pausa ao fim de cerca de uma
semana sem atividade**. Com o site em uso isto não acontece, mas se ficar
parado (férias, por exemplo) o site deixa de conseguir marcar até alguém
entrar no painel e carregar em "Restore project". Os dados não se perdem.
