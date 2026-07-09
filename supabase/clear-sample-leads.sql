-- Run this in the Supabase SQL Editor to remove the old demo leads.
-- It only deletes rows that match the original sample name, email, and phone.

with sample_leads(name, email, phone) as (
  values
    ('Maria das Graças Silva', 'mgraças@email.com', '(91) 98765-4321'),
    ('João Batista Ferreira', 'jbatista@gmail.com', '(91) 99123-4567'),
    ('Ana Cristina Pinheiro', 'anapinheiro@outlook.com', '(91) 98877-6655'),
    ('Carlos Eduardo Mendes', 'cemendes@empresa.com', '(91) 97654-3210'),
    ('Rosângela Torres', 'rtorres@email.com', '(91) 99988-7766'),
    ('Francisca Lima', 'frlima@gmail.com', '(91) 98811-2233'),
    ('Pedro Araújo Santos', 'pedroarauj@email.com', '(91) 99001-2345'),
    ('Tereza Nascimento', 'terezanasci@gmail.com', '(91) 98765-0011'),
    ('Raimundo Costa Barros', 'raimundocb@hotmail.com', '(91) 97788-9900'),
    ('Marlene Figueiredo', 'marlenef@email.com', '(91) 99234-5678'),
    ('Benedito Melo Carvalho', 'bmelo@gmail.com', '(91) 98656-7788'),
    ('Iracema Santos Vieira', 'iracema@email.com', '(91) 99456-7890')
)
delete from public.leads as leads
using sample_leads
where leads.name = sample_leads.name
  and lower(leads.email) = lower(sample_leads.email)
  and leads.phone = sample_leads.phone
returning leads.name, leads.email, leads.phone;
