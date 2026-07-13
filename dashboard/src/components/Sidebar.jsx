import React from 'react';
import { NavLink } from 'react-router-dom';

export const Sidebar = ({ items }) => {
  return (
    <nav className="antigravity-glass w-64 h-full p-6 flex flex-col space-y-4">
      {items.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            `flex items-center p-2 rounded-lg hover-float ${isActive ? 'bg-primary/20' : ''}`
          }
        >
          {item.icon && <span className="mr-2">{item.icon}</span>}
          <span className="text-text font-medium">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
};
