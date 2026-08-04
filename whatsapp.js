/**
 * Monta mensagem e URL do WhatsApp para confirmação de agendamento.
 * Destino: telefone do cliente (admin envia a partir do seu WhatsApp).
 */

function formatarDataConfirmacao(dataISO) {
  if (!dataISO) return '';
  const dataStr = String(dataISO).split('T')[0];
  const [ano, mes, dia] = dataStr.split('-').map(Number);
  const d = new Date(ano, mes - 1, dia);
  const weekday = d.toLocaleDateString('pt-BR', { weekday: 'short' });
  const dataFmt = d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return `${weekday}, ${dataFmt}`;
}

function montarMensagemConfirmacao(ag) {
  const dataFmt = formatarDataConfirmacao(ag.data);
  return (
    `✅ Agendamento Confirmado!\n` +
    `Cliente: ${ag.nome}\n` +
    `Telefone: ${ag.telefone}\n` +
    `Serviço: ${ag.servico}\n` +
    `Barbeiro: ${ag.barbeiro || 'Qualquer'}\n` +
    `Data: ${dataFmt}\n` +
    `Horário: ${ag.horario}\n` +
    `Valor: ${ag.preco}`
  );
}

function montarWhatsAppUrl(telefone, ag) {
  const tel = String(telefone || ag.telefone || '').replace(/\D/g, '');
  const telComDDI = tel.startsWith('55') ? tel : `55${tel}`;
  const msg = encodeURIComponent(montarMensagemConfirmacao(ag));
  return `https://wa.me/${telComDDI}?text=${msg}`;
}

module.exports = {
  formatarDataConfirmacao,
  montarMensagemConfirmacao,
  montarWhatsAppUrl,
};
