import React from 'react';
import { FloatingCard } from '../components/FloatingCard';
import { MetricCard } from '../components/MetricCard';
import { DataTable } from '../components/DataTable';
import { FaUserAlt, FaEnvelopeOpenText, FaServer } from 'react-icons/fa';

export const Admin = () => {
  const metrics = [
    { icon: FaUserAlt, label: 'Users', value: 128 },
    { icon: FaEnvelopeOpenText, label: 'Messages', value: 342 },
    { icon: FaServer, label: 'Servers', value: 8 },
  ];

  const rows = [
    { id: 1, name: 'Alice', role: 'Admin', status: 'Active' },
    { id: 2, name: 'Bob', role: 'Editor', status: 'Pending' },
    { id: 3, name: 'Charlie', role: 'Viewer', status: 'Inactive' },
  ];

  const columns = [
    { header: 'ID', accessor: 'id' },
    { header: 'Name', accessor: 'name' },
    { header: 'Role', accessor: 'role' },
    { header: 'Status', accessor: 'status' },
  ];

  return (
    <FloatingCard className="space-y-6">
      <h2 className="text-3xl font-bold mb-4">Admin Dashboard</h2>
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
