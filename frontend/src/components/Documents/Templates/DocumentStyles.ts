// frontend/src/components/Documents/Templates/DocumentStyles.ts

import { StyleSheet, Font } from '@react-pdf/renderer';

Font.register({
  family: 'Roboto',
  src: 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxP.ttf',
});




export const documentStyles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 10,
    backgroundColor: '#fff',
    fontFamily: 'Roboto',
  },
  
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  
  logoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  
  logo: {
    width: 50,
    height: 50,
    objectFit: 'contain',
  },
  
  companyName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  
  companyInfo: {
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  
  companyAddress: {
    fontSize: 9,
    color: '#555',
    textAlign: 'center',
    marginBottom: 3,
  },
  
  companyContact: {
    fontSize: 9,
    color: '#555',
    textAlign: 'center',
    marginBottom: 5,
  },
  
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 15,
    marginTop: 5,
  },
  
  legalItem: {
    fontSize: 8,
    color: '#666',
  },
  
  documentTitleSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  
  documentTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  
  documentNumber: {
    fontSize: 10,
    color: '#666',
  },
  
  customerSection: {
    marginBottom: 20,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
  },
  
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  
  table: {
    marginTop: 10,
    marginBottom: 20,
  },
  
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  
  tableRow: {
    flexDirection: 'row',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  
  colRef: { width: '15%', fontSize: 9 },
  colDesc: { width: '35%', fontSize: 9 },
  colQty: { width: '10%', textAlign: 'center', fontSize: 9 },
  colPrice: { width: '20%', textAlign: 'right', fontSize: 9 },
  colTotal: { width: '20%', textAlign: 'right', fontSize: 9 },
  
  totalsSection: {
    marginTop: 20,
    alignItems: 'flex-end',
  },
  
  totalRow: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  
  totalLabel: {
    width: 100,
    textAlign: 'right',
    fontWeight: 'bold',
    fontSize: 10,
  },
  
  totalValue: {
    width: 100,
    textAlign: 'right',
    fontSize: 10,
  },
  
  grandTotal: {
    marginTop: 5,
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: '#000',
  },
  
  amountInWordsSection: {
    marginTop: 15,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    alignItems: 'center',
  },
  
amountInWordsText: {
  fontSize: 9,
  textAlign: 'center',
},
  
  signatureSection: {
    marginTop: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  
  signatureBox: {
    width: '45%',
    textAlign: 'center',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#000',
  },
  
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
  },
  
  footerText: {
    fontSize: 8,
    color: '#666',
    textAlign: 'center',
  },
  
  paymentInfo: {
    marginTop: 15,
    padding: 8,
    backgroundColor: '#f9f9f9',
  },
});