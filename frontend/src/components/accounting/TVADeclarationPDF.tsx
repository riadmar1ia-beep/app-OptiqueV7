import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Font
} from '@react-pdf/renderer';

// Enregistrer les polices
Font.register({
  family: 'Helvetica',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/opensans/v18/mem8YaGs126MiZpBA-UFVZ0e.ttf', fontWeight: 'normal' },
    { src: 'https://fonts.gstatic.com/s/opensans/v18/mem5YaGs126MiZpBA-UN7rgOUuhp.ttf', fontWeight: 'bold' }
  ]
});

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    backgroundColor: '#FFFFFF'
  },
  header: {
    marginBottom: 30,
    borderBottom: 1,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 20
  },
  logoContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20
  },
  logo: {
    width: 80,
    height: 80,
    backgroundColor: '#F3F4F6'
  },
  companyInfo: {
    textAlign: 'right'
  },
  companyName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#1F2937'
  },
  companyDetail: {
    fontSize: 9,
    marginBottom: 2,
    color: '#6B7280'
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#1F2937'
  },
  subtitle: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 20,
    color: '#6B7280'
  },
  periodBox: {
    backgroundColor: '#F3F4F6',
    padding: 12,
    marginBottom: 20,
    borderRadius: 4,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  periodItem: {
    flex: 1,
    textAlign: 'center'
  },
  periodLabel: {
    fontSize: 9,
    color: '#6B7280',
    marginBottom: 4
  },
  periodValue: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#1F2937'
  },
  deadline: {
    color: '#DC2626'
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
    marginTop: 15,
    color: '#374151',
    backgroundColor: '#F9FAFB',
    padding: 8
  },
  table: {
    marginBottom: 15
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    padding: 8,
    fontWeight: 'bold',
    borderBottomWidth: 1,
    borderBottomColor: '#D1D5DB'
  },
  tableRow: {
    flexDirection: 'row',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB'
  },
  colRate: {
    width: '20%',
    textAlign: 'left'
  },
  colBase: {
    width: '40%',
    textAlign: 'right'
  },
  colTVA: {
    width: '40%',
    textAlign: 'right'
  },
  summaryBox: {
    backgroundColor: '#F9FAFB',
    padding: 15,
    marginTop: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 4
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  summaryTotal: {
    fontWeight: 'bold',
    fontSize: 12,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#D1D5DB'
  },
  amountInWords: {
    marginTop: 20,
    padding: 10,
    backgroundColor: '#FEF3C7',
    borderRadius: 4,
    textAlign: 'center',
    fontStyle: 'italic'
  },
  signature: {
    marginTop: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 20
  },
  signatureLeft: {
    textAlign: 'left'
  },
  signatureRight: {
    textAlign: 'right'
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 8,
    color: '#9CA3AF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 10
  }
});

// Fonction pour convertir un nombre en lettres (français)
const numberToWords = (num: number): string => {
  if (num === 0) return 'ZÉRO';
  
  const units = ['', 'UN', 'DEUX', 'TROIS', 'QUATRE', 'CINQ', 'SIX', 'SEPT', 'HUIT', 'NEUF', 'DIX', 'ONZE', 'DOUZE', 'TREIZE', 'QUATORZE', 'QUINZE', 'SEIZE', 'DIX-SEPT', 'DIX-HUIT', 'DIX-NEUF'];
  const tens = ['', 'DIX', 'VINGT', 'TRENTE', 'QUARANTE', 'CINQUANTE', 'SOIXANTE', 'SOIXANTE-DIX', 'QUATRE-VINGT', 'QUATRE-VINGT-DIX'];
  
  const convertHundreds = (n: number): string => {
    if (n === 0) return '';
    if (n === 100) return 'CENT';
    
    let result = '';
    const hundred = Math.floor(n / 100);
    const remainder = n % 100;
    
    if (hundred > 0) {
      result += hundred === 1 ? 'CENT' : units[hundred] + ' CENT';
      if (remainder > 0) result += ' ';
    }
    
    if (remainder > 0) {
      if (remainder < 20) {
        result += units[remainder];
      } else {
        const ten = Math.floor(remainder / 10);
        const unit = remainder % 10;
        
        if (ten === 7 || ten === 9) {
          result += tens[ten - 1] + ' ' + units[10 + unit];
        } else {
          result += tens[ten];
          if (unit > 0) result += '-' + units[unit].toLowerCase();
        }
      }
    }
    
    return result;
  };
  
  const parts = Math.floor(num).toString().split('.');
  let integerPart = parseInt(parts[0]);
  const decimalPart = parts[1] ? parseInt(parts[1].padEnd(2, '0').slice(0, 2)) : 0;
  
  let result = '';
  
  if (integerPart >= 1000000) {
    const millions = Math.floor(integerPart / 1000000);
    result += convertHundreds(millions) + ' MILLION' + (millions > 1 ? 'S' : '') + ' ';
    integerPart %= 1000000;
  }
  
  if (integerPart >= 1000) {
    const thousands = Math.floor(integerPart / 1000);
    if (thousands === 1) {
      result += 'MILLE ';
    } else {
      result += convertHundreds(thousands) + ' MILLE ';
    }
    integerPart %= 1000;
  }
  
  if (integerPart > 0) {
    result += convertHundreds(integerPart);
  }
  
  result = result.trim();
  
  if (decimalPart > 0) {
    result += ' ET ' + convertHundreds(decimalPart) + ' CENTIMES';
  } else {
    result += ' DIRHAMS';
  }
  
  return result;
};

// Formater la date
const formatDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

// Composant principal
interface TVADeclarationPDFProps {
  data: any;
}

export const TVADeclarationPDF: React.FC<TVADeclarationPDFProps> = ({ data }) => {
  const { declaration, company, salesByRate, purchasesByRate, totalHT, totalTVACollected, totalTVADeductible, netAPayer, quarterNames, generatedAt } = data;
  
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* En-tête */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <View style={styles.logo}>
              {company.logo_url && <Image src={company.logo_url} style={{ width: 80, height: 80 }} />}
            </View>
            <View style={styles.companyInfo}>
              <Text style={styles.companyName}>{company.company_name}</Text>
              <Text style={styles.companyDetail}>{company.address}</Text>
              <Text style={styles.companyDetail}>Tél: {company.phone}</Text>
              {company.email && <Text style={styles.companyDetail}>Email: {company.email}</Text>}
              <Text style={styles.companyDetail}>RC: {company.rc} | IF: {company.if_number}</Text>
              <Text style={styles.companyDetail}>Patente: {company.patente} | ICE: {company.ice}</Text>
            </View>
          </View>
        </View>

        {/* Titre */}
        <Text style={styles.title}>DÉCLARATION DE TVA</Text>
        <Text style={styles.subtitle}>
          {quarterNames[declaration.quarter]} {declaration.year}
        </Text>

        {/* Période */}
        <View style={styles.periodBox}>
          <View style={styles.periodItem}>
            <Text style={styles.periodLabel}>Période du</Text>
            <Text style={styles.periodValue}>{formatDate(declaration.start_date)}</Text>
          </View>
          <View style={styles.periodItem}>
            <Text style={styles.periodLabel}>au</Text>
            <Text style={styles.periodValue}>{formatDate(declaration.end_date)}</Text>
          </View>
          <View style={styles.periodItem}>
            <Text style={styles.periodLabel}>Date limite</Text>
            <Text style={[styles.periodValue, styles.deadline]}>{formatDate(declaration.due_date)}</Text>
          </View>
        </View>

        {/* Ventes par taux */}
        <Text style={styles.sectionTitle}>1. VENTES PAR TAUX DE TVA</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colRate}>Taux</Text>
            <Text style={styles.colBase}>Base HT (DH)</Text>
            <Text style={styles.colTVA}>TVA collectée (DH)</Text>
          </View>
          {salesByRate.map((item: any, index: number) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.colRate}>{item.taux}%</Text>
              <Text style={styles.colBase}>{item.base_ht.toLocaleString('fr-FR')}</Text>
              <Text style={styles.colTVA}>{item.tva.toLocaleString('fr-FR')}</Text>
            </View>
          ))}
        </View>

        {/* Achats par taux */}
        <Text style={styles.sectionTitle}>2. ACHATS PAR TAUX DE TVA (TVA DÉDUCTIBLE)</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colRate}>Taux</Text>
            <Text style={styles.colBase}>Base HT (DH)</Text>
            <Text style={styles.colTVA}>TVA déductible (DH)</Text>
          </View>
          {purchasesByRate.map((item: any, index: number) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.colRate}>{item.taux}%</Text>
              <Text style={styles.colBase}>{item.base_ht.toLocaleString('fr-FR')}</Text>
              <Text style={styles.colTVA}>{item.tva.toLocaleString('fr-FR')}</Text>
            </View>
          ))}
        </View>

        {/* Récapitulatif */}
        <Text style={styles.sectionTitle}>3. RÉCAPITULATIF</Text>
        <View style={styles.summaryBox}>
          <View style={styles.summaryRow}>
            <Text>Total HT des ventes</Text>
            <Text>{totalHT.toLocaleString('fr-FR')} DH</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text>Total TVA collectée</Text>
            <Text>{totalTVACollected.toLocaleString('fr-FR')} DH</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text>Total TVA déductible</Text>
            <Text>{totalTVADeductible.toLocaleString('fr-FR')} DH</Text>
          </View>
          <View style={styles.summaryTotal}>
            <Text style={{ fontWeight: 'bold' }}>Net à payer</Text>
            <Text style={{ fontWeight: 'bold', fontSize: 14, color: '#DC2626' }}>
              {netAPayer.toLocaleString('fr-FR')} DH
            </Text>
          </View>
        </View>

        {/* Montant en lettres */}
        <View style={styles.amountInWords}>
          <Text>Arrêté le présent montant à : {numberToWords(netAPayer)}</Text>
        </View>

        {/* Signature */}
        <View style={styles.signature}>
          <View style={styles.signatureLeft}>
            <Text>Fait à Casablanca, le {formatDate(new Date().toISOString())}</Text>
          </View>
          <View style={styles.signatureRight}>
            <Text>Signature et cachet</Text>
            <Text style={{ marginTop: 30 }}>{company.company_name}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>Document généré le {generatedAt} - Déclaration TVA {quarterNames[declaration.quarter]} {declaration.year}</Text>
        </View>
      </Page>
    </Document>
  );
};