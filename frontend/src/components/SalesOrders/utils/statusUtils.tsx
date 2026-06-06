import { Tag } from 'antd';

const STATUS_MAP: Record<string, { color: string; text: string }> = {
  draft: { color: 'default', text: '📝 Brouillon' },
  pending: { color: 'blue', text: '⏳ En attente' },
  confirmed: { color: 'orange', text: '✅ Confirmée' },
  in_production: { color: 'purple', text: '🔧 En production' },
  ready: { color: 'green', text: '🎯 Prête' },
  delivered: { color: 'cyan', text: '📦 Livrée' },
  cancelled: { color: 'red', text: '❌ Annulée' }
};

const PAYMENT_STATUS_MAP: Record<string, { color: string; text: string }> = {
  pending: { color: 'orange', text: 'En attente' },
  paid: { color: 'green', text: 'Payée' },
  partial: { color: 'blue', text: 'Partiel' },
  unpaid: { color: 'red', text: 'Impayée' }
};

export const getStatusTag = (status: string) => {
  const s = STATUS_MAP[status] || { color: 'default', text: status };
  return <Tag color={s.color}>{s.text}</Tag>;
};

export const getPaymentStatusTag = (status: string) => {
  const s = PAYMENT_STATUS_MAP[status] || { color: 'default', text: status };
  return <Tag color={s.color}>{s.text}</Tag>;
};