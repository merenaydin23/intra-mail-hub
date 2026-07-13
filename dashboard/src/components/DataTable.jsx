import React from 'react';

export const DataTable = ({ columns, data, className = '' }) => {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-100/70">
          <tr>
            {columns.map((col) => (
              <th
                key={col.accessor}
                className="px-4 py-2 text-left font-medium text-gray-600"
              >
                {col.Header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white/60 backdrop-blur-[5px]">
          {data.map((row, idx) => (
            <tr key={idx} className="hover-float">
              {columns.map((col) => (
                <td key={col.accessor} className="px-4 py-2 text-gray-800">
                  {row[col.accessor]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
