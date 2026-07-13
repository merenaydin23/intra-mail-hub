import React from 'react';

export const AntigravityInput = ({ label, type = 'text', value, onChange, placeholder, className = '' }) => {
  return (
    <div className={`flex flex-col ${className}`}>
      {label && <label className="text-text-muted mb-1">{label}</label>}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="bg-white/90 border border-white/60 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-primary hover-float transition"
      />
    </div>
  );
};
