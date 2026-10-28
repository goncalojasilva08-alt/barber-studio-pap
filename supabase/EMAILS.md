# Emails do site — Barber Studio

O site envia dois emails, cada um com o seu modelo no EmailJS
(https://dashboard.emailjs.com):

| Email | Quando | Modelo |
|---|---|---|
| Conta criada | No registo, com email e password ou com a Google | `EMAILJS_TEMPLATE_ID` |
| Marcação confirmada | Quando o cliente marca (a marcação fica logo confirmada) | `EMAILJS_TEMPLATE_BOOKING_ID` |

O plano gratuito dá 200 emails por mês e 2 modelos. Se o limite acabar, os
emails deixam de sair até renovar, mas o registo e as marcações funcionam na
mesma e o site mostra a confirmação no ecrã.

Quando o barbeiro cancela uma marcação não há email: o painel oferece um
atalho para avisar o cliente por WhatsApp, que não tem limite.

No registo com a Google, o email de conta criada é enviado na primeira vez
que a pessoa chega ao site com a conta acabada de criar (nos primeiros 10
minutos). Entradas seguintes com a Google não enviam nada.

## Onde está cada coisa

| O quê | Onde |
|---|---|
| Chaves do EmailJS | `js/services/emailService.js`, bloco `EMAIL_CONFIG` |
| Texto dos emails (assunto e frases) | `js/services/emailService.js`, funções `sendWelcomeEmail` e `sendBookingConfirmation` |
| Aspeto dos emails (HTML) | No EmailJS, em cada modelo |
| Gmail de onde saem | No EmailJS, em **Email Services** |

Os valores de `EMAIL_CONFIG`:

- `EMAILJS_SERVICE_ID` — o Gmail ligado (Email Services).
- `EMAILJS_TEMPLATE_ID` e `EMAILJS_TEMPLATE_BOOKING_ID` — os dois modelos
  (separador Settings de cada modelo). Com um deles vazio, só esse email
  deixa de ser enviado.
- `EMAILJS_PUBLIC_KEY` — a chave pública da conta (Account → General).

Com a chave pública vazia, o site não envia nenhum email e tudo o resto
funciona na mesma. A chave pública pode estar no código; a **Private Key**
nunca.

## Trocar o Gmail de envio (por exemplo, para o da barbearia)

Demora cerca de 5 minutos. Não é preciso mexer no modelo nem na chave pública.

1. No EmailJS, **Email Services → Add New Service → Gmail**.
2. **Connect Account** e iniciar sessão com o Gmail novo. Tem de ser o dono
   dessa conta a carregar em "Permitir".
3. **Create Service** e copiar o **Service ID** novo (`service_...`).
4. Em `js/services/emailService.js`, trocar o valor de `EMAILJS_SERVICE_ID`
   pelo novo. Fazer commit e push.
5. Criar uma conta de teste com um email verdadeiro e confirmar que o email
   chega e que o remetente é o Gmail novo.
6. Só depois, apagar o serviço antigo em Email Services.

No modelo, o campo **Reply To** deve ficar vazio: assim as respostas dos
clientes vão para o Gmail que envia.

Se o Gmail da barbearia passar também a ser o contacto público, trocar o
endereço em `politica-privacidade.html` (aparece duas vezes).

## Campos do modelo no EmailJS

| Campo | Valor |
|---|---|
| Subject | `{{subject}}` |
| To Email | `{{to_email}}` |
| From Name | `Barber Studio` |
| Reply To | (vazio) |

Os dois modelos têm os mesmos campos. Variáveis que o site envia e que o HTML
pode usar:

- Nos dois: `to_name`, `to_email`, `subject`, `intro`, `outro`, `site_url`,
  `atelier_name`, `atelier_phone`, `atelier_instagram`.
- Só na conta criada: `account_email`, `booking_url`.
- Só na marcação confirmada: `service_name`, `service_price`,
  `appointment_date`, `appointment_time`, `client_area_url`.

O logótipo do email é carregado de
`https://barber-studio.vercel.app/assets/icon-192.png`. Se o endereço do site
mudar, atualizar essa linha no HTML dos dois modelos.

## Se os emails deixarem de chegar

1. **Email History** no EmailJS mostra cada envio e o erro, se houver.
2. Limite mensal esgotado: aparece "requests left: 0" no topo do painel.
   Volta a zero no dia indicado em "Resets on".
3. O Gmail desligou-se (acontece se a password da conta mudar): em Email
   Services, abrir o serviço e voltar a ligar a conta.
4. Na consola do browser, o site escreve um aviso começado por
   `[EmailService]` quando um envio falha.
