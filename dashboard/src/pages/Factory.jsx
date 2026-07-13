import React from 'react';
import { FloatingCard } from '../components/FloatingCard';
import { MetricCard } from '../components/MetricCard';
import { DataTable } from '../components/DataTable';
import { FaIndustry, FaCog, FaChartLine } from 'react-icons/fa';

export const Factory = () => {
  const metrics = [
    { icon: FaIndustry, label: 'Production Units', value: 57 },
    { icon: FaCog, label: 'Active Machines', value: 34 },
    { icon: FaChartLine, label: 'Output Today', value: 1240 },
  ];

  const rows = [
    { id: 1, name: 'Machine A', status: 'Running', efficiency: '92%' },
    { id: 2, name: 'Machine B', status: 'Idle', efficiency: '0%' },
    { id: 3, name: 'Machine C', status: 'Running', efficiency: '88%' },
  ];

  const columns = [
    { header: 'ID', accessor: 'id' },
    { header: 'Name', accessor: 'name' },
    { header: 'Status', accessor: 'status' },
    { header: 'Efficiency', accessor: 'efficiency' },
  ];

  return (
    <FloatingCard className="space-y-6">
      <h2 className="text-3xl font-bold mb-4">Factory Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {metrics.map((m, i) => (
          <MetricCard key={i} icon={m.icon} label={m.label} value={m.value} />
        ))}
      </div>
      <div className="mt-6">
        <DataTable columns={columns} data={rows} />
      </div>
    </FloatingCard>
  );
};
