import React from 'react';

export const MetricCard = ({ icon: Icon, label, value, className = '' }) => {
  return (
    <div className={`flex items-center p-4 bg-surface hover-float rounded-2xl ${className}`}>
      <div className="text-primary text-3xl mr-4">
        {Icon && <Icon />}
      </div>
      <div className="flex flex-col">
        <span className="text-sm text-muted">{label}</span>
        <span className="text-xl font-semibold text-text">{value}</span>
      </div>
    </div>
  );
};
