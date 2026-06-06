import React from 'react';
import { View, Text, Image } from '@react-pdf/renderer';


interface CompanyHeaderProps {
  settings: any;
  documentType: string;
  documentNumber: string;
  date: string;
}

const CompanyHeader: React.FC<CompanyHeaderProps> = ({
  settings,
  documentType,
  documentNumber,
  date
}) => {

  // IMPORTANT :
  // L'image doit être dans :
  // frontend/public/images/Codebarre.png

const barcodeImagePath =
  '/images/Codebarre.png';

  return (
    <View style={{ marginBottom: 20 }}>

      {/* HEADER PRINCIPAL */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 15
        }}
      >

        {/* LOGO + INFOS SOCIÉTÉ */}
        <View style={{ width: '60%' }}>

          {settings?.logo_url && (
            <Image
              src={settings.logo_url}
              style={{
                width: 120,
                height: 60,
                objectFit: 'contain',
                marginBottom: 10
              }}
            />
          )}

          <Text
            style={{
              fontSize: 18,
              fontWeight: 'bold',
              marginBottom: 6
            }}
          >
            {settings?.company_name || 'MARZOUK OPTIQUE'}
          </Text>

          <Text style={{ fontSize: 9, marginBottom: 3 }}>
            {settings?.address || 'N40 Rue 6, Haj Fatah – Casablanca'}
          </Text>

          <Text style={{ fontSize: 9, marginBottom: 3 }}>
            Tél : {settings?.phone || '05 22 90 00 42'}
          </Text>

          {settings?.email && (
            <Text style={{ fontSize: 9, marginBottom: 3 }}>
              Email : {settings.email}
            </Text>
          )}

          <Text style={{ fontSize: 8, marginTop: 5 }}>
            RC : {settings?.rc || '397194'}
          </Text>

          <Text style={{ fontSize: 8 }}>
            IF : {settings?.if_number || '40416741'}
          </Text>

          <Text style={{ fontSize: 8 }}>
            Patente : {settings?.patente || '36265648'}
          </Text>

          <Text style={{ fontSize: 8 }}>
            ICE : {settings?.ice || '000819745000054'}
          </Text>

        </View>

        {/* CODE BARRE */}
<View
  style={{
    width: '35%',
    alignItems: 'flex-end',
    borderWidth: 1,
    borderColor: 'red'
  }}
>
          <Image
            src={barcodeImagePath}
            style={{
              width: 180,
              height: 50,
              objectFit: 'contain'
            }}
          />

        </View>

      </View>

      {/* TITRE DOCUMENT */}
      <View
        style={{
          alignItems: 'center',
          marginTop: 10,
          marginBottom: 20
        }}
      >

        <Text
          style={{
            fontSize: 22,
            fontWeight: 'bold',
            color: '#1677ff'
          }}
        >
          {documentType}
        </Text>

        <Text
          style={{
            fontSize: 14,
            marginTop: 5,
            fontWeight: 'bold'
          }}
        >
          N° {documentNumber}
        </Text>

        <Text
          style={{
            fontSize: 10,
            marginTop: 3,
            color: '#666'
          }}
        >
          Date : {date}
        </Text>

      </View>

      {/* LIGNE */}
      <View
        style={{
          borderBottomWidth: 1,
          borderBottomColor: '#d9d9d9',
          marginBottom: 10
        }}
      />

    </View>
  );
};

export default CompanyHeader;