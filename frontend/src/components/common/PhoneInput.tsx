import React, { useState, useEffect } from 'react';
import { Input } from 'antd';

interface PhoneInputProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
}

const PhoneInput: React.FC<PhoneInputProps> = ({ 
  value, 
  onChange, 
  placeholder = "0612345678 ou +212612345678"
}) => {
  const [localValue, setLocalValue] = useState(value || '');

  useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (/^(\+212|0)?[0-9]*$/.test(val)) {
      setLocalValue(val);
      if (onChange) onChange(val);
    }
  };

  const isValid = /^(\+212|0)[5-7][0-9]{8}$/.test(localValue);

  return (
    <Input
      value={localValue}
      onChange={handleChange}
      placeholder={placeholder}
      status={localValue && !isValid ? 'error' : ''}
    />
  );
};

export default PhoneInput;