import React from 'react';
import { FloatingCard } from '../components/FloatingCard';
import { MetricCard } from '../components/MetricCard';
import { DataTable } from '../components/DataTable';
import { FaCar, FaChartPie, FaUserFriends } from 'react-icons/fa';

export const Dealer = () => {
  const metrics = [
    { icon: FaCar, label: 'Vehicles', value: 124 },
    { icon: FaChartPie, label: 'Sales', value: 87 },
    { icon: FaUserFriends, label: 'Clients', value: 56 },
  ];

  const rows = [
    { id: 1, name: 'Dealer A', region: 'North', status: 'Active' },
    { id: 2, name: 'Dealer B', region: 'South', status: 'Pending' },
    { id: 3, name: 'Dealer C', region: 'East', status: 'Inactive' },
  ];

  const columns = [
    { header: 'ID', accessor: 'id' },
    { header: 'Name', accessor: 'name' },
    { header: 'Region', accessor: 'region' },
    { header: 'Status', accessor: 'status' },
  ];

  return (
    <FloatingCard className="space-y-6">
      <h2 className="text-3xl font-bold mb-4">Dealer Dashboard</h2>
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
