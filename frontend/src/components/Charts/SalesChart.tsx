import React from 'react';
import { Card } from 'antd';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface SalesChartProps {
  data: any[];
  type?: 'line' | 'bar';
}

const SalesChart: React.FC<SalesChartProps> = ({ data, type = 'line' }) => {
  const ChartComponent = type === 'line' ? LineChart : BarChart;
  
  return (
    <Card title="Évolution des ventes">
      <ResponsiveContainer width="100%" height={300}>
        <ChartComponent data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend />
          {type === 'line' ? (
            <Line type="monotone" dataKey="amount" stroke="#1890ff" name="Ventes (€)" />
          ) : (
            <Bar dataKey="amount" fill="#1890ff" name="Ventes (€)" />
          )}
        </ChartComponent>
      </ResponsiveContainer>
    </Card>
  );
};

export default SalesChart;
