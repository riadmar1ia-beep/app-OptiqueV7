// src/utils/formatters.ts
export const formatDate = (date: string | Date): string => {
  const d = new Date(date);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

export const formatCurrency = (cents: number): string => {
  const euros = cents / 100;
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: 'MAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(euros).replace('MAD', 'DH');
};

export const formatCurrencyFromEuros = (euros: number): string => {
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: 'MAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(euros).replace('MAD', 'DH');
};

export const parseCurrencyToCents = (value: string): number => {
  const number = parseFloat(value.replace(/[^0-9,-]/g, '').replace(',', '.'));
  return Math.round(number * 100);
};
