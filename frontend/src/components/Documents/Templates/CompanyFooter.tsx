import React from 'react';
import { View, Text, Image } from '@react-pdf/renderer';

interface CompanyFooterProps {
  documentNumber: string;
  showBarcode?: boolean;
}

const CompanyFooter: React.FC<CompanyFooterProps> = ({
  documentNumber,
  showBarcode = false
}) => {

  const barcodeImagePath =
    `${window.location.origin}/images/Codebarre.png`;

  return (

    <View
      style={{
        position: 'absolute',
        bottom: 20,
        left: 30,
        right: 30,
        borderTopWidth: 1,
        borderTopColor: '#d9d9d9',
        paddingTop: 10
      }}
    >

      {/* FOOTER */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >

        <View style={{ width: '70%' }}>

          <Text
            style={{
              fontSize: 8,
              color: '#666',
              marginBottom: 3
            }}
          >
            Document généré automatiquement par Optique V7 ERP
          </Text>

          <Text
            style={{
              fontSize: 8,
              color: '#666',
              marginBottom: 3
            }}
          >
            Merci pour votre confiance.
          </Text>

          <Text
            style={{
              fontSize: 8,
              color: '#999'
            }}
          >
            Réf document : {documentNumber}
          </Text>

        </View>

        {showBarcode && (
          <Image
            src={barcodeImagePath}
            style={{
              width: 100,
              height: 30,
              objectFit: 'contain'
            }}
          />
        )}

      </View>

    </View>

  );
};

export default CompanyFooter;