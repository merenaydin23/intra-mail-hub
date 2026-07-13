import React from 'react';

export const AntigravityButton = ({ children, onClick, className = '' }) => {
  return (
    <button
      onClick={onClick}
      className={`bg-primary text-white font-semibold py-2 px-4 rounded-xl hover-float ${className}`}
    >
      {children}
    </button>
  );
};
