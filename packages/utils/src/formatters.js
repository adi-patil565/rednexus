// Shared formatters

export const formatPhone = (phone) =>
  phone.replace(/(\d{5})(\d{5})/, '$1 $2');

export const formatDate = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

export const formatUnits = (n) => `${n} unit${n !== 1 ? 's' : ''}`;
