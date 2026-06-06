export function numberToFrenchWords(
  num: number
): string {

  const ones = [
    '',
    'un',
    'deux',
    'trois',
    'quatre',
    'cinq',
    'six',
    'sept',
    'huit',
    'neuf'
  ];

  const teens = [
    'dix',
    'onze',
    'douze',
    'treize',
    'quatorze',
    'quinze',
    'seize',
    'dix-sept',
    'dix-huit',
    'dix-neuf'
  ];

  const tens = [
    '',
    '',
    'vingt',
    'trente',
    'quarante',
    'cinquante',
    'soixante'
  ];

  if (num === 0) {
    return 'zéro';
  }

  if (num < 10) {
    return ones[num];
  }

  if (num < 20) {
    return teens[num - 10];
  }

  if (num < 70) {

    const ten = Math.floor(num / 10);

    const unit = num % 10;

    return (
      tens[ten] +
      (unit ? '-' + ones[unit] : '')
    );
  }

  if (num < 80) {

    return (
      'soixante-' +
      numberToFrenchWords(num - 60)
    );
  }

  if (num < 100) {

    return (
      'quatre-vingt-' +
      numberToFrenchWords(num - 80)
    );
  }

  if (num < 1000) {

    const hundred =
      Math.floor(num / 100);

    const rest =
      num % 100;

    let result = '';

    if (hundred > 1) {
      result +=
        ones[hundred] + ' ';
    }

    result += 'cent';

    if (rest > 0) {
      result +=
        ' ' +
        numberToFrenchWords(rest);
    }

    return result;
  }

  if (num < 1000000) {

    const thousand =
      Math.floor(num / 1000);

    const rest =
      num % 1000;

    let result = '';

    if (thousand > 1) {
      result +=
        numberToFrenchWords(thousand)
        + ' ';
    }

    result += 'mille';

    if (rest > 0) {
      result +=
        ' ' +
        numberToFrenchWords(rest);
    }

    return result;
  }

  return num.toString();
}