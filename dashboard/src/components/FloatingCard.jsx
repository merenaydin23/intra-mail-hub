import React from 'react';

export const FloatingCard = ({ children, className = '' }) => {
  return (
    <div className={`antigravity-glass hover-float ${className}`}>
      {children}
    </div>
  );
};
